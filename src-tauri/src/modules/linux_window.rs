//! Linux (GTK/WebKitGTK) window tuning for the main window.
//!
//! The borderless window is created with an RGBA visual so the frontend can
//! round its corners, and GTK then reports no opaque region at all. Mutter and
//! other compositors must then alpha-blend the entire surface every frame and
//! cannot cull or unredirect what sits behind it. Declaring the interior
//! (everything except the rounded corners and the 1px border) opaque restores
//! the fast path a regular opaque terminal window like GNOME Terminal gets.

/// CSS corner radius of `#root` under `html[data-chrome="borderless"]`.
const CORNER_RADIUS: i32 = 12;
/// `#root` draws a 1px border whose colour may carry alpha.
const BORDER: i32 = 1;

/// Two overlapping rectangles covering the window minus its rounded corners and
/// border, as `(x, y, width, height)` in GDK logical pixels. Returns `None` when
/// the window is too small for any interior to exist.
pub fn opaque_rects(width: i32, height: i32) -> Option<[(i32, i32, i32, i32); 2]> {
    let inset = CORNER_RADIUS.max(BORDER);
    if width <= 2 * inset || height <= 2 * inset {
        return None;
    }
    Some([
        (BORDER, inset, width - 2 * BORDER, height - 2 * inset),
        (inset, BORDER, width - 2 * inset, height - 2 * BORDER),
    ])
}

pub fn tune_main_window(window: &tauri::WebviewWindow) {
    if let Ok(gtk_window) = window.gtk_window() {
        install_opaque_region(&gtk_window);
    }
    let _ = window.with_webview(|webview| {
        use webkit2gtk::{HardwareAccelerationPolicy, SettingsExt, WebViewExt};
        let Some(settings) = webview.inner().settings() else {
            return;
        };
        settings.set_enable_webgl(true);
        // Older WebKitGTK builds default to ON_DEMAND, which drops in and out
        // of accelerated compositing and stutters while the terminal repaints.
        // The documented escape hatch for broken GPU stacks stays honoured.
        if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
            settings.set_hardware_acceleration_policy(HardwareAccelerationPolicy::Always);
        }
    });
}

fn install_opaque_region(gtk_window: &gtk::ApplicationWindow) {
    use gtk::prelude::*;

    fn apply(widget: &gtk::ApplicationWindow) {
        let Some(gdk_window) = widget.window() else {
            return;
        };
        let region =
            opaque_rects(widget.allocated_width(), widget.allocated_height()).map(|rects| {
                let rects = rects.map(|(x, y, w, h)| gtk::cairo::RectangleInt::new(x, y, w, h));
                gtk::cairo::Region::create_rectangles(&rects)
            });
        gdk_window.set_opaque_region(region.as_ref());
    }

    // GTK resets the opaque region to empty for app-paintable windows in its
    // own size-allocate and style-updated handlers; ours run after and win.
    gtk_window.connect_size_allocate(|w, _| apply(w));
    gtk_window.connect_style_updated(apply);
    gtk_window.connect_realize(apply);
    apply(gtk_window);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interior_excludes_corners_and_border() {
        let [a, b] = opaque_rects(800, 600).expect("interior");
        assert_eq!(a, (1, 12, 798, 576));
        assert_eq!(b, (12, 1, 776, 598));
    }

    #[test]
    fn corner_pixels_are_never_declared_opaque() {
        let (w, h) = (300, 200);
        let rects = opaque_rects(w, h).expect("interior");
        let inside = |px: i32, py: i32| {
            rects
                .iter()
                .any(|&(x, y, rw, rh)| px >= x && px < x + rw && py >= y && py < y + rh)
        };
        for (px, py) in [
            (0, 0),
            (w - 1, 0),
            (0, h - 1),
            (w - 1, h - 1),
            (5, 5),
            (w - 6, h - 6),
        ] {
            assert!(!inside(px, py), "({px},{py}) sits in a rounded corner");
        }
        for (px, py) in [(w / 2, 0), (0, h / 2), (w - 1, h / 2), (w / 2, h - 1)] {
            assert!(!inside(px, py), "({px},{py}) sits on the border");
        }
        assert!(inside(w / 2, h / 2));
        assert!(inside(1, h / 2));
        assert!(inside(w / 2, 1));
    }

    #[test]
    fn tiny_windows_declare_nothing() {
        assert_eq!(opaque_rects(0, 0), None);
        assert_eq!(opaque_rects(24, 500), None);
        assert_eq!(opaque_rects(500, 24), None);
        assert!(opaque_rects(25, 25).is_some());
    }
}
