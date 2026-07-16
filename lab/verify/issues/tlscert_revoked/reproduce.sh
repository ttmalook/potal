#!/bin/sh
set -e
. /verify/issues/_tls_lib.sh
echo "-- [reproduce] 폐지된 인증서 취약 환경 --"
reset_tls
CA=/tmp/ca
rm -rf "$CA"; mkdir -p "$CA/newcerts"; touch "$CA/index.txt"
echo 'unique_subject = no' > "$CA/index.txt.attr"
echo 1000 > "$CA/serial"; echo 1000 > "$CA/crlnumber"
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes -keyout "$CA/ca.key" -out "$CA/ca.crt" -subj "/CN=Lab Revocation CA" 2>/dev/null
cat > "$CA/ca.cnf" <<'CNF'
[ca]
default_ca = CA_default
[CA_default]
dir = /tmp/ca
database = $dir/index.txt
new_certs_dir = $dir/newcerts
certificate = $dir/ca.crt
private_key = $dir/ca.key
serial = $dir/serial
crlnumber = $dir/crlnumber
default_md = sha256
policy = pol
default_days = 365
default_crl_days = 30
[pol]
commonName = supplied
CNF
openssl req -newkey rsa:2048 -nodes -keyout "$CERTS/server.key" -out "$CA/s.csr" -subj "/CN=lab-tls-drill" 2>/dev/null
openssl ca -batch -config "$CA/ca.cnf" -in "$CA/s.csr" -out "$CERTS/server.crt" 2>/dev/null
openssl ca -batch -config "$CA/ca.cnf" -revoke "$CERTS/server.crt" 2>/dev/null
openssl ca -batch -config "$CA/ca.cnf" -gencrl -out "$CA/crl.pem" 2>/dev/null
reload_tls
echo "\$ openssl verify -crl_check -CAfile ca.crt -CRLfile crl.pem server.crt"
openssl verify -crl_check -CAfile "$CA/ca.crt" -CRLfile "$CA/crl.pem" "$CERTS/server.crt" 2>&1 | head -2 || true
if openssl verify -crl_check -CAfile "$CA/ca.crt" -CRLfile "$CA/crl.pem" "$CERTS/server.crt" >/dev/null 2>&1; then echo "FAIL: 폐지 안됨(취약 아님)"; exit 1; fi
openssl verify -crl_check -CAfile "$CA/ca.crt" -CRLfile "$CA/crl.pem" "$CERTS/server.crt" 2>&1 | grep -qi revoked || { echo "FAIL: revoked 사유 아님"; exit 1; }
echo "PASS(reproduce): 인증서가 CRL에 폐지 등재 -> 취약 재현"
