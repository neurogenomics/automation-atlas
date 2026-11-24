#!/usr/bin/env bash
# Official signed Ubuntu packages, extracted without install scripts or privileges.
set -euo pipefail
umask 077
if [[ $# != 1 || "$1" != /* || -e "$1" ]]; then
  echo 'Usage: install-browser-libs.sh NEW_ABSOLUTE_DIRECTORY' >&2; exit 2
fi
source /etc/os-release
if [[ "$ID" != ubuntu || "$VERSION_ID" != 24.04 ]]; then
  echo 'Browser dependency extraction supports Ubuntu 24.04 only.' >&2; exit 2
fi
case "$(dpkg --print-architecture)" in
  arm64) arch=arm64; triplet=aarch64-linux-gnu; archive=https://ports.ubuntu.com/ubuntu-ports; security=$archive ;;
  amd64) arch=amd64; triplet=x86_64-linux-gnu; archive=https://archive.ubuntu.com/ubuntu; security=https://security.ubuntu.com/ubuntu ;;
  *) echo 'Unsupported browser architecture.' >&2; exit 2 ;;
esac
work=$1
mkdir -m 700 "$work"
mkdir -p "$work"/{lists/partial,archives/partial,log,prefix,font-cache,empty-config}
keyring=/usr/share/keyrings/ubuntu-archive-keyring.gpg
test -r "$keyring"
cat > "$work/sources.list" <<EOF
deb [arch=$arch signed-by=$keyring] $archive noble main universe
deb [arch=$arch signed-by=$keyring] $archive noble-updates main universe
deb [arch=$arch signed-by=$keyring] $security noble-security main universe
EOF
# APT_CONFIG is read before config fragments; -o alone is too late to prevent
# image-provided hooks (for example Docker cache cleanup) from being loaded.
cat > "$work/apt.conf" <<EOF
Dir::Etc::parts "$work/empty-config";
Dir::Etc::main "-";
EOF
export APT_CONFIG="$work/apt.conf"
options=(
  -o "Dir::Etc::sourcelist=$work/sources.list" -o 'Dir::Etc::sourceparts=-'
  -o "Dir::Etc::parts=$work/empty-config" -o 'Dir::Etc::main=-'
  -o "Dir::State::lists=$work/lists" -o 'Dir::State::status=/var/lib/dpkg/status'
  -o "Dir::State::extended_states=$work/extended_states"
  -o "Dir::Cache::archives=$work/archives" -o "Dir::Cache::pkgcache=$work/pkgcache.bin"
  -o "Dir::Cache::srcpkgcache=$work/srcpkgcache.bin" -o "Dir::Log=$work/log"
  -o 'Debug::NoLocking=1' -o "APT::Sandbox::User=$(id -un)"
  -o 'Acquire::AllowInsecureRepositories=false' -o 'APT::Get::AllowUnauthenticated=false'
)
apt-get "${options[@]}" -qq update
# Playwright 1.65 Chromium list for Ubuntu24.04, plus deterministic fallback fonts.
packages=(libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64
  libcairo2 libcups2t64 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0t64 libnspr4 libnss3
  libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3
  libxkbcommon0 libxrandr2 libfontconfig1 libfreetype6 fonts-liberation fonts-noto-color-emoji)
apt-get "${options[@]}" -qq --yes --download-only --no-install-recommends install "${packages[@]}"
shopt -s nullglob
printf 'Package\tVersion\tArchitecture\tSHA256\n' > "$work/package-receipt.tsv"
for package in "$work"/archives/*.deb; do
  dpkg-deb --show --showformat='${Package}\t${Version}\t${Architecture}\t' "$package" >> "$work/package-receipt.tsv"
  sha256sum "$package" | cut -d ' ' -f 1 >> "$work/package-receipt.tsv"
  # dpkg-deb extracts payload only; no maintainer scripts or setuid execution.
  dpkg-deb --extract "$package" "$work/prefix"
done
# No extracted program is executed; remove privileged mode bits defensively.
find "$work/prefix" -type f -perm /6000 -exec chmod a-s '{}' +
cat > "$work/fonts.conf" <<EOF
<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>
<dir>$work/prefix/usr/share/fonts</dir><dir>/usr/share/fonts</dir>
<cachedir>$work/font-cache</cachedir></fontconfig>
EOF
printf '%s\n' "$work/prefix/usr/lib/$triplet:$work/prefix/lib/$triplet:$work/prefix/usr/lib" > "$work/library-path"
cat "$work/package-receipt.tsv"
printf 'Browser dependencies extracted for %s; no packages installed.\n' "$arch"
