# jsonrepair 3.15.0

Source: https://github.com/josdejong/jsonrepair/tree/v3.15.0
Pinned npm tarball integrity and upstream file SHA256 values are in source.json.
The three regular ESM files are vendored under the ISC license in LICENSE.md.

Local changes in regular/jsonrepair.js:
- A candidate closing quote followed by a valid JSON escape is allowed to continue through the existing embedded-quote repair logic. Unicode escapes still use the upstream hexadecimal validator.
- Optional completeDocument mode rejects invented missing values, missing container/string endings, truncated numbers/Unicode, ellipsis placeholders, dangling concatenation and multiple root documents. The phone adapter always enables it.
- Absent source-map references were removed from all three distributed JavaScript files.

All other parsing and string repair remains the upstream implementation. Strict JSON is tried before repair; repaired data still passes the original phone schemas and ownership checks. The complete ISC notice is also included in the runtime bundle banner.
