use tauri::menu::{MenuBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let holdplan = SubmenuBuilder::new(app, "Holdplan")
                .about(Some(tauri::menu::AboutMetadata {
                    name: Some("Holdplan".into()),
                    copyright: Some("Planning aid — not certified W&B.".into()),
                    ..Default::default()
                }))
                .separator()
                .item(&PredefinedMenuItem::quit(app, Some("Quit Holdplan"))?)
                .build()?;

            let edit = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let view = SubmenuBuilder::new(app, "View")
                .fullscreen()
                .build()?;

            let window = SubmenuBuilder::new(app, "Window")
                .minimize()
                .maximize()
                .separator()
                .close_window()
                .build()?;

            let menu = MenuBuilder::new(app)
                .items(&[&holdplan, &edit, &view, &window])
                .build()?;
            app.set_menu(menu)?;

            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_title("Holdplan");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Holdplan");
}
