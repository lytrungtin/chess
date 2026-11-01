import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

const APP_NAME = "Cờ";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content: "Cờ caro và cờ tướng. Bot Áp Lực: thắng ngay, chặn ngay, rồi mới ép quân.",
      },
      { name: "theme-color", content: "#241e18" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Noto+Serif+SC:wght@700&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: () => (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var k="chunk-reload";function go(){try{if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,"1")}catch(e){}location.reload()}window.addEventListener("vite:preloadError",function(e){e.preventDefault();go()});window.addEventListener("unhandledrejection",function(e){var m=String((e.reason&&e.reason.message)||e.reason||"");if(m.indexOf("Failed to fetch dynamically imported module")!==-1||m.indexOf("Importing a module script failed")!==-1){e.preventDefault();go()}});window.addEventListener("error",function(e){var t=e.target;if(!t||!t.tagName)return;var src=t.src||t.href||"";if(src.indexOf("/assets/")===-1)return;if(t.tagName==="SCRIPT"||t.tagName==="LINK")go()},true);setTimeout(function(){try{sessionStorage.removeItem(k)}catch(e){}},8000)})();`,
          }}
        />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
