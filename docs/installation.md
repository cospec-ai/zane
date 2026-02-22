# Installing Zane

Zane runs a local Anchor service on your Mac that connects to Orbit (the hosted control plane) so you can supervise Codex sessions remotely.

## Requirements

- macOS (Apple Silicon or Intel)
- [Bun](https://bun.sh) runtime
- [Codex CLI](https://github.com/openai/codex) installed

## Install

Run the install script:

```bash
curl -fsSL https://raw.githubusercontent.com/cospec-ai/zane/main/install.sh | bash
```

This clones the repo to `~/.zane`, installs Anchor dependencies, adds `zane` to your PATH, and prompts whether to run `zane self-host` immediately.

### Build from source

```bash
git clone https://github.com/cospec-ai/zane.git ~/.zane
cd ~/.zane/services/anchor && bun install
```

Add `~/.zane/bin` to your PATH.

## Setup

1. If you skipped deployment during install, run `zane self-host`
2. Run `zane start` (or `zane login` to re-authenticate)
3. A device code is displayed in your terminal
4. A browser window opens to enter the code
5. Once authorised, credentials are saved to `~/.zane/credentials.json`

## Running

Start Anchor:
```bash
zane start
```

Anchor connects to Orbit and waits for commands from the web client. Open the Zane web app in your browser to start supervising sessions.

## CLI Commands

| Command | Description |
|---------|-------------|
| `zane start` | Start the anchor service |
| `zane login` | Re-authenticate with the web app |
| `zane doctor` | Check prerequisites and configuration |
| `zane config` | Open `.env` in your editor |
| `zane update` | Pull latest code and reinstall dependencies |
| `zane self-host` | Run the self-host setup wizard |
| `zane uninstall` | Remove Zane from your system |
| `zane version` | Print version |
| `zane help` | Show help |

## Verify

Check that everything is configured correctly:
```bash
zane doctor
```

This checks for Bun, Codex CLI, Anchor source, dependencies, `.env` configuration, credentials, and whether Anchor is running.

## Updating

```bash
zane update
```

This resets local repo changes, pulls the latest code, reinstalls Anchor dependencies, and redeploys Cloudflare services when self-host settings are present.

## Self-hosting

To deploy the entire stack to your own Cloudflare account:

```bash
zane self-host
```

See the [self-hosting guide](self-hosting.md) for prerequisites and a full walkthrough.

## Troubleshooting

### "zane: command not found"
Make sure `~/.zane/bin` is in your PATH:
```bash
echo 'export PATH="$HOME/.zane/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Connection issues
Re-authenticate:
```bash
zane login
```

### Check configuration
```bash
zane doctor
```
