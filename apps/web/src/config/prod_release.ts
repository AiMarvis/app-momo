const version = "0.5.10";
const pubDate = "2026-07-03T23:57:28.000Z";
const signature = "";

const githubRepo = "AiMarvis/momo";
const webUrl = "https://kuku.mom";
const siteUrl = "https://www.kuku.mom";
const apiBaseUrl = "https://api.kuku.mom";

function githubReleaseAssetUrl(assetName: string): string {
  return `https://github.com/${githubRepo}/releases/download/${version}/${assetName}`;
}

export const prodRelease = {
  version,
  pubDate,
  signature,
  githubRepo,
  webUrl,
  siteUrl,
  apiBaseUrl,
  notes: `Momo ${version}`,
  assets: {
    macDownload: "Momo.app.tar.gz",
    updaterTarGz: "Momo.app.tar.gz",
  },
} as const;

export const prodReleaseLinks = {
  github: `https://github.com/${prodRelease.githubRepo}`,
  downloadMac: githubReleaseAssetUrl(prodRelease.assets.macDownload),
  updaterTarGz: githubReleaseAssetUrl(prodRelease.assets.updaterTarGz),
} as const;

const updaterPlatforms =
  signature.length > 0
    ? {
        "darwin-aarch64": {
          signature: prodRelease.signature,
          url: prodReleaseLinks.updaterTarGz,
        },
      }
    : {};

export const prodReleaseManifest = {
  version: prodRelease.version,
  notes: prodRelease.notes,
  pub_date: prodRelease.pubDate,
  platforms: updaterPlatforms,
} as const;
