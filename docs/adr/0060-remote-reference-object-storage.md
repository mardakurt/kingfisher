# ADR 0060 — Remote reference object storage

Date: 2026-09-09. Status: recommendation, not deployed. Side audit of base `582095b`.

Keep the application repository code-first. Keep the existing small public packs on GitHub Pages while they fit. For a substantially larger corpus, prefer Cloudflare R2 Standard behind a custom HTTPS domain and explicit CDN caching rules. No account, bucket, DNS or production setting was changed by this audit.

## Evidence and alternatives

Prices below were checked against primary documentation on the date above. They exclude taxes, domain registration and optional services. S3-compatible describes an API, not a universal tariff.

| Host                                      | Storage / traffic                                                                                                                                    | HTTPS, CORS and delivery                                                                       | Operational tradeoff                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Pages                              | Published site maximum 1 GB; recommended source repository limit 1 GB; soft bandwidth limit 100 GB/month                                             | HTTPS static chunk URLs; limited response-header control                                       | Lowest maintenance now; unsuitable for a growing multi-GB corpus. [Limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)                                                                                                                     |
| Cloudflare R2 Standard                    | $0.015/GB-month; $4.50/million Class A and $0.36/million Class B requests; free egress; free tier includes 10 GB-month, 1 million A and 10 million B | Custom HTTPS domain, configurable CORS, CDN caching; separate shard GETs need no Range support | Preferred for public read-heavy data; configure bucket policy, CORS and caching. [Pricing](https://developers.cloudflare.com/r2/pricing/), [public delivery](https://developers.cloudflare.com/r2/buckets/public-buckets/), [CORS](https://developers.cloudflare.com/r2/buckets/cors/) |
| Backblaze B2                              | Starts at $6.95/TB-month; free egress up to 3× average monthly stored data, then $0.01/GB; partner-CDN delivery can remove overage                   | HTTPS objects, CORS, S3-compatible API                                                         | Cheaper storage; evaluate CDN partner terms and request behavior for this workload. [Pricing](https://www.backblaze.com/cloud-storage/pricing), [CORS](https://www.backblaze.com/docs/cloud-storage-cross-origin-resource-sharing-rules)                                               |
| Amazon S3 / another S3-compatible service | Region, storage class, requests and internet delivery determine the bill; quote the chosen region rather than assume one worldwide price             | HTTPS, configurable CORS, byte-range GET; S3 GetObject supports one byte range per request     | Mature access/versioning tools; more billing and CDN choices than this app currently needs. [Pricing](https://aws.amazon.com/s3/pricing/), [GetObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html)                                                             |

For illustration, 100 GB continuously stored on R2 Standard costs about $1.35/month after the 10 GB free tier, before operations and optional services. This is arithmetic from published rates, not a forecast of Kingfisher traffic.

## Delivery contract

Publish versioned immutable object paths and a manifest carrying each compressed chunk's byte length and SHA-256. Upload all chunks first; publish the manifest last. Keep older referenced objects available. CDN TTLs do not establish integrity; the application checks the digest. Never overwrite a published version's bytes. Retention/versioning or bucket locks can enforce this operational convention if required.

Set CORS for the actual Studio origins, allow GET/HEAD, and expose the length/ETag headers the client consumes. Serve `.kfp.gz` as opaque compressed bytes without a Content-Encoding header that silently expands them before digest verification. Configure caching for this extension explicitly. Use a custom domain for production; Cloudflare documents `r2.dev` as rate-limited development access.

A position hashes to an existing explorer shard. A game opens its existing game-score shard. A player lookup needs an index and playergames shard; no whole-pack transfer is necessary. The current format already separates these objects. Do not make byte-range support a prerequisite or rewrite the pack format without measurements.

## Local cache contract to integrate in Phase 29

Use online and Install for offline must remain separate actions. Online data belongs in a dedicated, disposable cache with a global byte budget. Installed data and authored studies, notes, repertoire, training and personal collections are never LRU eviction candidates.

A conservative **32 MiB compressed cache prototype** holds thirteen maximum-size Elite explorer chunks measured in this audit (2,455,092 bytes each). Treat this as a starting measurement hypothesis, not a proven production default: measure real hit rate, decoded heap and concurrent fetches before shipping. Bound decoded data separately; an eight-entry cache with a 128 MiB per-entry decode limit is not a small memory bound. Desktop has no demonstrated need for a larger default yet.

The installer should consult verified streamed chunks before fetching, reverify length/digest, pin chunks during promotion, and report both reused and downloaded bytes. Cache identity must include source/version/digest. Cancellation must propagate to fetch; obsolete completions must not replace current-position results. A failed cache write must not erase authored work.

At the audited base, the remote provider is an unwired skeleton with an unbounded in-memory map; it is not evidence that this architecture is delivered. See the storage audit and the executable real-gzip reproduction before enabling its UI.
