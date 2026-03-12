const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 520,
    height: 300,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    autoHideMenuBar: true,
    backgroundColor: "#0a0a0c",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  splash.loadURL(
    "data:text/html;charset=UTF-8," +
      encodeURIComponent(`
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>ID Card Generator</title>
            <style>
              :root { color-scheme: dark; }
              html, body { height: 100%; margin: 0; }
              body {
                display: grid;
                place-items: center;
                background:
                  radial-gradient(circle at 15% 10%, rgba(255,255,255,.08), transparent 36%),
                  radial-gradient(circle at 85% 0%, rgba(150,150,160,.08), transparent 36%),
                  linear-gradient(180deg, #121216, #060607);
                color: #f2f2f4;
                font-family: "Segoe UI", Arial, sans-serif;
              }
              .wrap {
                text-align: center;
                padding: 24px;
                border: 1px solid rgba(220,220,230,.22);
                border-radius: 14px;
                background: rgba(20,20,24,.85);
                box-shadow: 0 18px 40px rgba(0,0,0,.55);
                min-width: 360px;
              }
              h1 {
                margin: 0 0 8px;
                font-size: 26px;
                letter-spacing: .04em;
                text-transform: uppercase;
              }
              p {
                margin: 0;
                color: #c7c9cf;
                font-size: 15px;
              }
            </style>
          </head>
          <body>
            <div class="wrap">
              <h1>ID Card Generator</h1>
              <p>by Rafael Betinol</p>
            </div>
          </body>
        </html>
      `)
  );

  return splash;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: "ID Card Generator by Rafael Betinol",
    icon: path.join(__dirname, "assets", "rb.ico"),
    backgroundColor: "#0b0b0d",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadFile(path.join(__dirname, "index.html"));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  return win;
}

app.whenReady().then(() => {
  const splash = createSplashWindow();
  const mainWindow = createWindow();

  mainWindow.once("ready-to-show", () => {
    setTimeout(() => {
      if (!splash.isDestroyed()) splash.close();
      mainWindow.show();
    }, 1200);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
