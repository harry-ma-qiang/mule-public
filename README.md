# Mule

Mule is an agentic framework I am building for my own use. It is meant to be:

- **an agentic workflow system**, in the spirit of LangGraph: agents, tools and
  human approvals described as workflows in plain YAML, with shared state,
  loops, fan-out, checkpoints and objective gates that decide when work is done;
- **a plugin-based AI harness**, in the spirit of DSH: a small core where tools,
  engines and capabilities are plugins that describe themselves (MCP-compatible)
  and are added or removed without rebuilding the core;
- **a base for personal assistant agents**, in the spirit of Meta's Muse:
  agents that work for one person, hold no secrets themselves, and ask before
  doing anything risky.

It runs one task at a time on a local machine, and is designed so that a
long-running service can drive many such runs later.

## Status

This is an early, personal project. The source code is not published yet: I
have not had time to audit it for mistakes or for sensitive data committed by
accident, and I do not expect the project to draw attention any time soon. I
may publish the full source under the MIT license in the future; until then
the released artifacts are free to use under the Mule Binary License (see
LICENSE).

If you are curious, feel free to download a release and try it.

## Releases

Binaries, libraries and scripts are published on the GitHub Releases page.
Check each download against its published SHA-256 checksum (and signature)
before running it. Mule runs with your user's permissions, so try it in a VM
or container first.

## License

Released artifacts: Mule Binary License 1.0. Documentation under docs/:
CC BY 4.0. Third-party components are listed in THIRD-PARTY-LICENSES inside
each release.
