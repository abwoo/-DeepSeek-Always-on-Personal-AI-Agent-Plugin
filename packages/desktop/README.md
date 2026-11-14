# DeepSeek Always-on — Desktop native plugin

Development candidate for DeepSeek Harness **0.2.2-rc.3**, Cordis **4.1.0**. The package runs inside the official Desktop Profile and provides Personal Agent. Local Harness workspaces and hosted Personal Agent conversations remain separate.

## Graphical installation

Open **Plugins → Add plugin**, enter the operator-published npm package/version or supported tarball address, confirm installation and enable the plugin. This is third-party distribution, not an official DeepSeek endorsement. Production publication is blocked until a real service and release gates are verified; do not mistake this private development candidate for a live service.

The pinned official Plugins page supports disabling/enabling and removal. For third-party upgrades its UI instructs uninstall/reinstall; use the operator's immutable supported package version. Removing the plugin does not delete hosted tasks or memory. Reinstall and sign in to recover the same account's authority. Background cloud work is controlled in Tasks or the account service; disabling the local presentation plugin does not stop its independent hosted Agent.

No public production URL, provider credit, Apple signing or physical-phone certification is included. See repository docs/V03_ACCEPTANCE.md for current implementation and exact gates.
