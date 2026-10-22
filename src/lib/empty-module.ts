/**
 * What a Node built-in resolves to in a browser bundle (`next.config.ts`).
 *
 * sql.js ships one file for Node and browsers, and names `fs`, `path` and
 * `crypto` in the branch it takes only under Node. A browser never runs that
 * branch; the bundler still has to resolve the names in it.
 */
export {};
