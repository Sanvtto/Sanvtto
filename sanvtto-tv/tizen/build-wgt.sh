#!/usr/bin/env bash
# Empacota o app Tizen (.wgt sem assinatura). O instalador assina com o seu certificado Samsung.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p ../release
rm -f ../release/SanvttoTV.wgt
zip -q -r -X ../release/SanvttoTV.wgt config.xml index.html icon.png css js
echo "✓ release/SanvttoTV.wgt ($(du -h ../release/SanvttoTV.wgt | cut -f1))"
