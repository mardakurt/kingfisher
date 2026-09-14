/*
  The Sparkle bridge: the one piece of native code in the desktop shell.

  Kingfisher's updater is Sparkle (sparkle-project.org), the update framework
  Mac applications use. Sparkle is Objective-C and lives in
  Contents/Frameworks/Sparkle.framework; the shell is Node, in Electron's
  main process. This file is the whole surface between them — a Node-API
  addon that creates one SPUUpdater with Sparkle's own standard user
  interface, and reports what the updater does back to JavaScript as events.

  ## What it deliberately does not do

  It does not decide anything. Whether to check, when to check, what the
  feed is, whether the relaunch may proceed — every one of those is a
  JavaScript decision (`desktop/src/sparkle-updater.mjs`, then
  `update-service.mjs`), because that is where the rest of the shell's
  state is: the save barrier, the profile handoff, the channel, the log.
  The bridge holds one updater, one delegate, one feed override string, and
  one postponed install block.

  ## Loading

  The framework is `dlopen`ed from a path JavaScript supplies, and the
  classes are looked up by name (`NSClassFromString`). Nothing here links
  against Sparkle at build time — so the same `.node` runs in a packaged
  bundle (Contents/Frameworks) and in a developer checkout
  (desktop/vendor/Sparkle), and a missing or foreign framework is an error
  the caller reads, not a dyld crash at process start.

  ## Events

  Delegate calls are forwarded through a thread-safe function — Sparkle
  calls its delegate on the main thread, which is also Electron's
  JavaScript thread, but a Node-API call is only valid inside a JavaScript
  callback, and a run-loop callback is not one. Every event is therefore
  asynchronous, and nothing in this file waits for JavaScript: the one
  delegate method whose answer matters — whether the relaunch may proceed —
  returns "postpone" at once, keeps Sparkle's install block, and JavaScript
  calls `resumeRelaunch()` when the save barrier has passed.

  Each event is a name and a JSON object; see `sparkle-updater.mjs` for the
  list, which is the contract the tests read.
*/

#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <Sparkle/Sparkle.h>

#include <dlfcn.h>
#include <node_api.h>
#include <string.h>
#include <string>

// --- the JavaScript side ------------------------------------------------------

namespace {

struct Event {
  char *name;
  char *json;
};

napi_threadsafe_function gEvents = nullptr;
void *gFrameworkHandle = nullptr;
NSString *gFeedURLOverride = nil;
void (^gPostponedInstall)(void) = nil;

/** A JSON object for the event payload; every value is a string, number, bool or null. */
NSString *jsonOf(NSDictionary *dictionary) {
  NSError *error = nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:dictionary ?: @{} options:0 error:&error];
  if (!data) return @"{}";
  return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"{}";
}

void emit(NSString *name, NSDictionary *payload) {
  if (!gEvents) return;
  Event *event = new Event;
  event->name = strdup(name.UTF8String);
  event->json = strdup(jsonOf(payload).UTF8String);
  napi_status status = napi_call_threadsafe_function(gEvents, event, napi_tsfn_nonblocking);
  if (status != napi_ok) {
    free(event->name);
    free(event->json);
    delete event;
  }
}

void callJs(napi_env env, napi_value callback, void * /*context*/, void *data) {
  Event *event = static_cast<Event *>(data);
  if (env && callback) {
    napi_value argv[2];
    napi_value undefined;
    napi_get_undefined(env, &undefined);
    napi_create_string_utf8(env, event->name, NAPI_AUTO_LENGTH, &argv[0]);
    napi_create_string_utf8(env, event->json, NAPI_AUTO_LENGTH, &argv[1]);
    napi_call_function(env, undefined, callback, 2, argv, nullptr);
  }
  free(event->name);
  free(event->json);
  delete event;
}

/**
  A string constant the framework exports. Nothing here links against
  Sparkle, so its `extern NSString *const` symbols are read through the
  handle `load()` opened; a missing one is an empty key, never a crash.
*/
NSString *exportedString(const char *symbol) {
  if (!gFrameworkHandle) return @"";
  NSString *__strong *slot = static_cast<NSString *__strong *>(dlsym(gFrameworkHandle, symbol));
  return (slot && *slot) ? *slot : @"";
}

id orNull(id value) {
  return value ?: [NSNull null];
}

NSDictionary *describeItem(SUAppcastItem *item) {
  if (!item) return @{};
  return @{
    @"version" : orNull(item.versionString),
    @"displayVersion" : orNull(item.displayVersionString),
    @"title" : orNull(item.title),
    @"date" : orNull(item.dateString),
    @"contentLength" : @(item.contentLength),
    @"fileURL" : orNull(item.fileURL.absoluteString),
    @"releaseNotesURL" : orNull(item.releaseNotesURL.absoluteString),
    @"infoURL" : orNull(item.infoURL.absoluteString),
    @"minimumSystemVersion" : orNull(item.minimumSystemVersion),
    @"channel" : orNull(item.channel),
    @"delta" : @(item.deltaUpdate),
    @"informationOnly" : @(item.informationOnlyUpdate),
    @"critical" : @(item.criticalUpdate),
    @"majorUpgrade" : @(item.majorUpgrade),
  };
}

NSDictionary *describeError(NSError *error) {
  if (!error) return @{};
  NSError *underlying = error.userInfo[NSUnderlyingErrorKey];
  return @{
    @"domain" : orNull(error.domain),
    @"code" : @(error.code),
    @"description" : orNull(error.localizedDescription),
    @"reason" : orNull(error.localizedFailureReason),
    @"recovery" : orNull(error.localizedRecoverySuggestion),
    @"underlying" : underlying ? orNull(underlying.localizedDescription) : [NSNull null],
    @"underlyingCode" : underlying ? @(underlying.code) : [NSNull null],
  };
}

NSString *checkName(SPUUpdateCheck check) {
  switch (check) {
    case SPUUpdateCheckUpdates:
      return @"user";
    case SPUUpdateCheckUpdatesInBackground:
      return @"background";
    case SPUUpdateCheckUpdateInformation:
      return @"information";
  }
  return @"unknown";
}

NSString *choiceName(SPUUserUpdateChoice choice) {
  switch (choice) {
    case SPUUserUpdateChoiceSkip:
      return @"skip";
    case SPUUserUpdateChoiceInstall:
      return @"install";
    case SPUUserUpdateChoiceDismiss:
      return @"dismiss";
  }
  return @"unknown";
}

NSString *stageName(SPUUserUpdateStage stage) {
  switch (stage) {
    case SPUUserUpdateStageNotDownloaded:
      return @"not-downloaded";
    case SPUUserUpdateStageDownloaded:
      return @"downloaded";
    case SPUUserUpdateStageInstalling:
      return @"installing";
  }
  return @"unknown";
}

}  // namespace

// --- the delegate --------------------------------------------------------------

@interface KFSparkleDelegate : NSObject <SPUUpdaterDelegate, SPUStandardUserDriverDelegate>
@end

@implementation KFSparkleDelegate

- (BOOL)updater:(SPUUpdater *)updater
    mayPerformUpdateCheck:(SPUUpdateCheck)updateCheck
                    error:(NSError *__autoreleasing *)error {
  emit(@"checking", @{@"check" : checkName(updateCheck)});
  return YES;
}

- (nullable NSString *)feedURLStringForUpdater:(SPUUpdater *)updater {
  // nil hands the decision back to Info.plist's SUFeedURL, which is the
  // production feed. The override exists for the staging harnesses and is
  // only ever set from JavaScript, which only sets it from an environment
  // variable the packaged application is never launched with.
  return gFeedURLOverride;
}

- (BOOL)updaterShouldPromptForPermissionToCheckForUpdates:(SPUUpdater *)updater {
  // Never. There are no scheduled checks to ask permission for:
  // SUEnableAutomaticChecks is false in Info.plist and this refuses the
  // prompt even if that were ever lost.
  return NO;
}

- (void)updater:(SPUUpdater *)updater didFinishLoadingAppcast:(SUAppcast *)appcast {
  emit(@"appcast-loaded", @{@"items" : @(appcast.items.count)});
}

- (void)updater:(SPUUpdater *)updater didFindValidUpdate:(SUAppcastItem *)item {
  emit(@"found", describeItem(item));
}

- (void)updaterDidNotFindUpdate:(SPUUpdater *)updater error:(NSError *)error {
  NSMutableDictionary *payload = [describeError(error) mutableCopy];
  // Sparkle says why: no item at all, the newest one is what is running, or
  // the newest one was skipped by the person or needs a newer macOS.
  NSNumber *reason = error.userInfo[exportedString("SPUNoUpdateFoundReasonKey")];
  payload[@"noUpdateReason"] = reason ?: [NSNull null];
  SUAppcastItem *latest = error.userInfo[exportedString("SPULatestAppcastItemFoundKey")];
  payload[@"latest"] = latest ? describeItem(latest) : [NSNull null];
  emit(@"not-found", payload);
}

- (void)updater:(SPUUpdater *)updater
    userDidMakeChoice:(SPUUserUpdateChoice)choice
            forUpdate:(SUAppcastItem *)updateItem
                state:(SPUUserUpdateState *)state {
  emit(@"choice", @{
    @"choice" : choiceName(choice),
    @"stage" : stageName(state.stage),
    @"userInitiated" : @(state.userInitiated),
    @"item" : describeItem(updateItem),
  });
}

- (void)updater:(SPUUpdater *)updater
    willDownloadUpdate:(SUAppcastItem *)item
           withRequest:(NSMutableURLRequest *)request {
  emit(@"will-download", @{@"item" : describeItem(item), @"url" : orNull(request.URL.absoluteString)});
}

- (void)updater:(SPUUpdater *)updater didDownloadUpdate:(SUAppcastItem *)item {
  emit(@"did-download", @{@"item" : describeItem(item)});
}

- (void)updater:(SPUUpdater *)updater
    failedToDownloadUpdate:(SUAppcastItem *)item
                     error:(NSError *)error {
  emit(@"download-failed", @{@"item" : describeItem(item), @"error" : describeError(error)});
}

- (void)userDidCancelDownload:(SPUUpdater *)updater {
  emit(@"download-cancelled", @{});
}

- (void)updater:(SPUUpdater *)updater willExtractUpdate:(SUAppcastItem *)item {
  emit(@"will-extract", @{@"item" : describeItem(item)});
}

- (void)updater:(SPUUpdater *)updater didExtractUpdate:(SUAppcastItem *)item {
  emit(@"did-extract", @{@"item" : describeItem(item)});
}

- (void)updater:(SPUUpdater *)updater willInstallUpdate:(SUAppcastItem *)item {
  emit(@"will-install", @{@"item" : describeItem(item)});
}

- (BOOL)updater:(SPUUpdater *)updater
    shouldPostponeRelaunchForUpdate:(SUAppcastItem *)item
                 untilInvokingBlock:(void (^)(void))installHandler {
  // Always postponed. JavaScript runs the save barrier — the renderer
  // confirming every write is on disk — and then calls resumeRelaunch();
  // a barrier that fails leaves the block unrun and tells the person.
  gPostponedInstall = [installHandler copy];
  emit(@"postpone-relaunch", @{@"item" : describeItem(item)});
  return YES;
}

- (BOOL)updaterShouldRelaunchApplication:(SPUUpdater *)updater {
  return YES;
}

- (void)updaterWillRelaunchApplication:(SPUUpdater *)updater {
  emit(@"will-relaunch", @{});
}

- (BOOL)updater:(SPUUpdater *)updater
    willInstallUpdateOnQuit:(SUAppcastItem *)item
    immediateInstallationBlock:(void (^)(void))immediateInstallHandler {
  // Reported, not taken over: the update installs when the application
  // quits, which is what the person chose.
  emit(@"will-install-on-quit", @{@"item" : describeItem(item)});
  return NO;
}

- (void)updater:(SPUUpdater *)updater didAbortWithError:(NSError *)error {
  emit(@"aborted", describeError(error));
}

- (void)updater:(SPUUpdater *)updater
    didFinishUpdateCycleForUpdateCheck:(SPUUpdateCheck)updateCheck
                                 error:(nullable NSError *)error {
  emit(@"finished", @{@"check" : checkName(updateCheck), @"error" : error ? describeError(error) : [NSNull null]});
}

// SPUStandardUserDriverDelegate — only for the log; every window is Sparkle's.

- (void)standardUserDriverWillShowModalAlert {
  emit(@"modal-alert", @{@"showing" : @YES});
}

- (void)standardUserDriverDidShowModalAlert {
  emit(@"modal-alert", @{@"showing" : @NO});
}

- (void)standardUserDriverWillFinishUpdateSession {
  emit(@"session-finished", @{});
}

@end

// --- the addon -----------------------------------------------------------------

namespace {

SPUUpdater *gUpdater = nil;
SPUStandardUserDriver *gDriver = nil;
KFSparkleDelegate *gDelegate = nil;

napi_value throwError(napi_env env, NSString *message) {
  napi_throw_error(env, nullptr, message.UTF8String);
  return nullptr;
}

NSString *stringArg(napi_env env, napi_value value) {
  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, nullptr, 0, &length) != napi_ok) return nil;
  std::string buffer(length + 1, '\0');
  napi_get_value_string_utf8(env, value, &buffer[0], length + 1, &length);
  return [NSString stringWithUTF8String:buffer.c_str()];
}

napi_value boolValue(napi_env env, BOOL value) {
  napi_value result;
  napi_get_boolean(env, value, &result);
  return result;
}

/** load(frameworkExecutable): { version } — dlopen Sparkle and find its classes. */
napi_value Load(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  NSString *executable = argc ? stringArg(env, argv[0]) : nil;
  if (!executable.length) return throwError(env, @"load() needs the path of Sparkle.framework/Sparkle");
  if (!gFrameworkHandle) {
    gFrameworkHandle = dlopen(executable.fileSystemRepresentation, RTLD_NOW | RTLD_LOCAL);
    if (!gFrameworkHandle) {
      const char *why = dlerror();
      return throwError(env, [NSString stringWithFormat:@"Sparkle could not be loaded from %@: %s", executable, why ? why : "dlopen failed"]);
    }
  }
  Class updaterClass = NSClassFromString(@"SPUUpdater");
  Class driverClass = NSClassFromString(@"SPUStandardUserDriver");
  if (!updaterClass || !driverClass) {
    return throwError(env, [NSString stringWithFormat:@"%@ is not Sparkle: SPUUpdater and SPUStandardUserDriver were not found in it", executable]);
  }
  NSBundle *bundle = [NSBundle bundleForClass:updaterClass];
  NSString *version = bundle.infoDictionary[@"CFBundleShortVersionString"] ?: @"";
  napi_value result, versionValue, pathValue;
  napi_create_object(env, &result);
  napi_create_string_utf8(env, version.UTF8String, NAPI_AUTO_LENGTH, &versionValue);
  napi_set_named_property(env, result, "version", versionValue);
  napi_create_string_utf8(env, (bundle.bundlePath ?: @"").UTF8String, NAPI_AUTO_LENGTH, &pathValue);
  napi_set_named_property(env, result, "bundlePath", pathValue);
  return result;
}

/**
  start(onEvent, options): { ok, error } — create and start the updater.

  Fails, rather than throws, when Sparkle refuses the host bundle: no
  SUPublicEDKey in Info.plist is the developer-checkout case
  (`electron .` runs inside Electron.app), and the caller reports "updates
  are disabled in this build" exactly as before.
*/
napi_value Start(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  napi_valuetype type;
  if (argc < 1 || napi_typeof(env, argv[0], &type) != napi_ok || type != napi_function) {
    return throwError(env, @"start() needs an event callback");
  }
  if (!gFrameworkHandle) return throwError(env, @"load() first");
  if (gUpdater) return throwError(env, @"the updater is already started");

  napi_value name;
  napi_create_string_utf8(env, "kingfisher-sparkle", NAPI_AUTO_LENGTH, &name);
  if (napi_create_threadsafe_function(env, argv[0], nullptr, name, 0, 1, nullptr, nullptr, nullptr, callJs, &gEvents) != napi_ok) {
    return throwError(env, @"could not create the event channel");
  }
  // The channel must not keep the process alive on its own.
  napi_unref_threadsafe_function(env, gEvents);

  if (argc > 1 && napi_typeof(env, argv[1], &type) == napi_ok && type == napi_object) {
    napi_value feed;
    if (napi_get_named_property(env, argv[1], "feedURL", &feed) == napi_ok &&
        napi_typeof(env, feed, &type) == napi_ok && type == napi_string) {
      gFeedURLOverride = stringArg(env, feed);
    }
  }

  NSBundle *host = [NSBundle mainBundle];
  gDelegate = [[KFSparkleDelegate alloc] init];
  gDriver = [[NSClassFromString(@"SPUStandardUserDriver") alloc] initWithHostBundle:host delegate:gDelegate];
  gUpdater = [[NSClassFromString(@"SPUUpdater") alloc] initWithHostBundle:host
                                                          applicationBundle:host
                                                                 userDriver:gDriver
                                                                   delegate:gDelegate];
  // Asked for, never scheduled; downloaded only after the person chose to.
  // Both are also in Info.plist (SUEnableAutomaticChecks, SUAllowsAutomaticUpdates);
  // stating them here keeps a user-defaults value from ever overriding them.
  gUpdater.automaticallyChecksForUpdates = NO;
  gUpdater.automaticallyDownloadsUpdates = NO;
  gUpdater.sendsSystemProfile = NO;

  NSError *error = nil;
  BOOL ok = [gUpdater startUpdater:&error];
  napi_value result, okValue;
  napi_create_object(env, &result);
  napi_get_boolean(env, ok, &okValue);
  napi_set_named_property(env, result, "ok", okValue);
  if (!ok) {
    napi_value message;
    NSString *text = error.localizedDescription ?: @"Sparkle did not start";
    napi_create_string_utf8(env, text.UTF8String, NAPI_AUTO_LENGTH, &message);
    napi_set_named_property(env, result, "error", message);
    gUpdater = nil;
    gDriver = nil;
    gDelegate = nil;
  }
  return result;
}

napi_value CheckForUpdates(napi_env env, napi_callback_info) {
  if (!gUpdater) return throwError(env, @"the updater is not started");
  [gUpdater checkForUpdates];
  return nullptr;
}

napi_value CheckForUpdateInformation(napi_env env, napi_callback_info) {
  if (!gUpdater) return throwError(env, @"the updater is not started");
  [gUpdater checkForUpdateInformation];
  return nullptr;
}

napi_value CanCheckForUpdates(napi_env env, napi_callback_info) {
  return boolValue(env, gUpdater ? gUpdater.canCheckForUpdates : NO);
}

napi_value SessionInProgress(napi_env env, napi_callback_info) {
  return boolValue(env, gUpdater ? gUpdater.sessionInProgress : NO);
}

napi_value SetFeedURL(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  napi_valuetype type = napi_undefined;
  if (argc) napi_typeof(env, argv[0], &type);
  gFeedURLOverride = type == napi_string ? stringArg(env, argv[0]) : nil;
  return nullptr;
}

/** The feed Sparkle would ask, after the override and Info.plist. */
napi_value FeedURL(napi_env env, napi_callback_info) {
  NSString *url = gUpdater ? gUpdater.feedURL.absoluteString : nil;
  napi_value result;
  if (!url) {
    napi_get_null(env, &result);
    return result;
  }
  napi_create_string_utf8(env, url.UTF8String, NAPI_AUTO_LENGTH, &result);
  return result;
}

/** resumeRelaunch(): run the install block Sparkle handed to the delegate. Returns whether one was waiting. */
napi_value ResumeRelaunch(napi_env env, napi_callback_info) {
  void (^block)(void) = gPostponedInstall;
  gPostponedInstall = nil;
  if (!block) return boolValue(env, NO);
  block();
  return boolValue(env, YES);
}

napi_value HasPostponedRelaunch(napi_env env, napi_callback_info) {
  return boolValue(env, gPostponedInstall != nil);
}

napi_value LastUpdateCheckDate(napi_env env, napi_callback_info) {
  NSDate *date = gUpdater ? gUpdater.lastUpdateCheckDate : nil;
  napi_value result;
  if (!date) {
    napi_get_null(env, &result);
    return result;
  }
  napi_create_double(env, date.timeIntervalSince1970 * 1000.0, &result);
  return result;
}

napi_value Init(napi_env env, napi_value exports) {
  const napi_property_descriptor methods[] = {
    {"load", nullptr, Load, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
    {"start", nullptr, Start, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
    {"checkForUpdates", nullptr, CheckForUpdates, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
    {"checkForUpdateInformation", nullptr, CheckForUpdateInformation, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
    {"canCheckForUpdates", nullptr, CanCheckForUpdates, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
    {"sessionInProgress", nullptr, SessionInProgress, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
    {"setFeedURL", nullptr, SetFeedURL, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
    {"feedURL", nullptr, FeedURL, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
    {"resumeRelaunch", nullptr, ResumeRelaunch, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
    {"hasPostponedRelaunch", nullptr, HasPostponedRelaunch, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
    {"lastUpdateCheckDate", nullptr, LastUpdateCheckDate, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
  };
  napi_define_properties(env, exports, sizeof(methods) / sizeof(methods[0]), methods);
  return exports;
}

}  // namespace

NAPI_MODULE(kingfisher_sparkle, Init)
