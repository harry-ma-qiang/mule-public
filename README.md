# Mule

Mule is a single static binary that runs agent workflows from a plain YAML spec.
The spec itself is built in: run `mule spec` to browse it.

## Status

This is a personal project. The source code is not published yet: I have not
had time to audit it for mistakes or for sensitive data committed by accident,
and I do not expect the project to draw attention any time soon. I may publish
the full source under the MIT license in the future; until then the binaries
are free to use under the Mule Binary License (see LICENSE).

If you are curious, feel free to download a release and try it.

## Install and verify

Download the binary for your platform from the Releases page and check it
against the published SHA-256 checksum (and signature) before running it.
Mule runs with your user's permissions, so try it in a VM or container first.

## Documentation

`mule spec` and `mule explain <field>` print the built-in spec. The same
documentation is under docs/ (CC BY 4.0).
