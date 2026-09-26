# Remote access

My Private Server never asks you to open a port on your router. The server always **connects out**,
so it works behind NAT, carrier-grade NAT (CGNAT, common with Philippine and many mobile ISPs),
dynamic IP addresses and double routers.

## The honest rule

A device on the Internet cannot reach a PC that has no public address unless *something reachable*
helps: a coordination server that lets the two sides find each other, and (sometimes) a relay that
forwards traffic. **No software can avoid that.** What we can do, and do, is:

- make every such component **free and open source, or self-hostable**;
- never require a paid plan, a VPS, or a domain;
- show you which method is in use and **say so when a method is unavailable** instead of pretending.

## Methods (all free)

| Method | Cost | How it connects | Encryption | Third party? |
|---|---|---|---|---|
| **WireGuard mesh** (Tailscale client) with **self-hosted Headscale** | Free, open source | Peer-to-peer after NAT traversal; encrypted relay (DERP) fallback | WireGuard, end-to-end | None: you run Headscale |
| **WireGuard mesh** with Tailscale's free plan | Free (optional) | Same as above | WireGuard, end-to-end | Tailscale coordinates; relays see only encrypted packets |
| **Cloudflare Tunnel**, quick tunnel | Free, no account, no domain | HTTPS reverse tunnel | TLS to Cloudflare edge | Cloudflare terminates TLS (can see traffic) |
| **Cloudflare Tunnel**, named tunnel | Free account; your own domain | Same, permanent address | TLS to Cloudflare edge | Cloudflare |
| **Self-hosted relay** (frp) | Free, open source | TLS tunnel to a relay you run | TLS to your relay | None: you run frps |

The dashboard's **Remote Access** page lists these with what data is sent, why, and where.

### Which connection method will I get?

| This PC's network | The phone's network | WireGuard mesh result |
|---|---|---|
| Home router (normal NAT) | Mobile data / other Wi-Fi | **NAT traversal** (direct, peer-to-peer) in most cases |
| CGNAT (strict/symmetric NAT) | Normal NAT | Usually **NAT traversal** |
| CGNAT | CGNAT / strict mobile NAT | **Relay** (still end-to-end encrypted) |
| UDP blocked by a firewall | any | **Relay** |
| Same local network | same | **Direct** |

The status screen shows the method per device (`Direct`, `NAT Traversal`, `Relay`, or `HTTPS tunnel`) and
the reason when a relay is used. **Test Connection** can also run a STUN check that reports your public
address and whether your NAT is strict (symmetric).

## Self-hosting the coordination (zero third parties)

- **Headscale** (open-source Tailscale control server) needs one small machine with a public address:
  any PC or server you already have with a public IP, or a free-tier cloud VM. Enter its URL in
  *Coordination server*. Devices install the free Tailscale client and point it at the same URL.
- **frp**: run `frps` on a machine with a public address; enter its address, token and a public port.

## Implementation

`MyPrivateServer.RemoteAccess` defines `IRemoteAccessProvider`. Each provider starts/stops its client,
reports `RemoteStatus` (state, method, encryption, relay use, addresses, peers) and runs its own
diagnostics. `RemoteAccessService` supervises the active provider: health check every 15 s, reconnect
with exponential backoff (5 s → 5 min), immediate re-check on network changes, and an honest
`Unavailable` state when there is no Internet or the client is missing. Local access never depends on it.
Provider secrets (auth keys, tunnel tokens) are encrypted at rest and never returned to the browser.

Adding a provider (for example a future built-in relay) means implementing one interface. Nothing
else in the server changes.
