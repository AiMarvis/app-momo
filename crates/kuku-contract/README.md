# kuku-contract

Generated Rust contract bindings for Kuku.

The source files under `src/generated/` are generated from protobuf definitions in `packages/contract/proto`. Do not edit generated Rust code directly.

To change this crate, update the protobuf contract first and regenerate:

```sh
pnpm --filter @kuku/contract run generate
```
