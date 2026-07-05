import { describe, expect, it } from "vitest";

import { externalLinks } from "@/config/links";
import { prodRelease, prodReleaseLinks, prodReleaseManifest } from "@/config/prod_release";

describe("prod release config", () => {
  it("drives the mac download link from the configured release version", () => {
    expect(externalLinks.github).toBe(prodReleaseLinks.github);
    expect(externalLinks.downloadMac).toBe(
      `https://github.com/${prodRelease.githubRepo}/releases/download/${prodRelease.version}/Momo.app.tar.gz`,
    );
  });

  it("keeps the updater manifest aligned with signed release metadata", () => {
    expect(prodReleaseManifest.version).toBe(prodRelease.version);
    expect(prodReleaseManifest.notes).toBe(`Momo ${prodRelease.version}`);
    expect(prodReleaseManifest.pub_date).toBe(prodRelease.pubDate);
    if (prodRelease.signature) {
      expect(prodReleaseManifest.platforms["darwin-aarch64"]).toEqual({
        signature: prodRelease.signature,
        url: prodReleaseLinks.updaterTarGz,
      });
    } else {
      expect(prodReleaseManifest.platforms).toEqual({});
    }
  });
});
