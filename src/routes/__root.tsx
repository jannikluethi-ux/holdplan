import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { markTauriShell } from "@/lib/holdplan/native";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

const APP_NAME = "Holdplan";

function Shell() {
  useEffect(() => {
    markTauriShell();
  }, []);
  return (
    <html lang="en" className="dark antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground">
        <PreviewHostBridge />
        <AuthProvider>
          <TooltipProvider delayDuration={220}>
            <Outlet />
            <Toaster
              theme="dark"
              position="bottom-right"
              toastOptions={{
                duration: 2800,
                style: {
                  background: "#161B22",
                  border: "1px solid #2A313C",
                  color: "#E8EDF4",
                },
              }}
            />
          </TooltipProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "theme-color", content: "#0E1116" },
      {
        name: "description",
        content: "Plan the real inner room — then put the cargo in it. 3D load planning for project logistics and airfreight.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap",
      },
    ],
  }),
  component: Shell,
});
