"""Public HTTP targets only; resolution must be pinned to prevent DNS rebinding."""

import ipaddress
import socket
from urllib.parse import urlsplit


class UnsafeTarget(ValueError):
    """The target could route a monitoring request into a private network."""


_BLOCKED_SUFFIXES = (".localhost", ".local", ".internal", ".home.arpa", ".test", ".invalid")


def validate_target_url(url: str) -> tuple[str, int]:
    if not isinstance(url, str) or not url or "\\" in url:
        raise UnsafeTarget("Invalid HTTP target.")

    try:
        parsed = urlsplit(url)
        host = parsed.hostname
        port = parsed.port
    except ValueError as exc:
        raise UnsafeTarget("Invalid HTTP target.") from exc

    if parsed.scheme not in {"http", "https"} or not host:
        raise UnsafeTarget("Only absolute HTTP and HTTPS URLs are supported.")

    if parsed.username is not None or parsed.password is not None:
        raise UnsafeTarget("Credentials in monitoring URLs are not allowed.")

    if parsed.fragment:
        raise UnsafeTarget("URL fragments are not allowed.")

    host = host.rstrip(".").lower()
    if not host or "%" in host:
        raise UnsafeTarget("Invalid host name.")

    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        if "." not in host or host in {"localhost", "metadata.google.internal"}:
            raise UnsafeTarget("Internal host names are not allowed.") from None
        if host.endswith(_BLOCKED_SUFFIXES):
            raise UnsafeTarget("Internal host names are not allowed.")
    else:
        if not address.is_global:
            raise UnsafeTarget("Private or reserved IP addresses are not allowed.")

    return host, port or (443 if parsed.scheme == "https" else 80)


def resolve_public_ip(host: str, port: int) -> str:
    """Reject the whole DNS answer if any address is not globally routable."""
    try:
        responses = socket.getaddrinfo(
            host,
            port,
            type=socket.SOCK_STREAM,
        )
    except socket.gaierror:
        raise

    if not responses:
        raise socket.gaierror(socket.EAI_NONAME, "Host has no DNS records.")

    addresses = {entry[4][0] for entry in responses}
    for raw in addresses:
        try:
            address = ipaddress.ip_address(raw)
        except ValueError as exc:
            raise UnsafeTarget("Invalid DNS answer.") from exc
        if not address.is_global:
            raise UnsafeTarget("DNS resolved to a private or reserved IP address.")

    return sorted(addresses, key=lambda address: (":" in address, address))[0]
