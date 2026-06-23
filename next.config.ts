import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: "dummy-org",
  project: "dummy-project",
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  disableLogger: true,
});
