# Synthetic gateway TLS fixture

This self-signed certificate is valid only for `cimiloop-gateway.test`. Its public
test private key is checked in deliberately. Never use this certificate, key or
fixture trust configuration with an actual model provider. The probe pins this
certificate and routes that reserved test hostname to its own loopback server;
it neither installs a trust root nor modifies the OS certificate store.
