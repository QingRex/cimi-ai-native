# HTTPS transport fixture

This self-signed certificate and public test private key are exclusively for a
loopback TLS test server. The SAN names the fixed production hostname to exercise
real hostname checks. Trust is supplied only by the test's trusted dial seam;
the production boundary never uses this CA, private key, loopback route or peer
substitution. This does not establish production certificate or provider access.
