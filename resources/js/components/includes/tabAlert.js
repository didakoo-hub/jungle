export const TAB_ALERT_MS = 1000;

export function createTabAlert({ page = globalThis.document, every = TAB_ALERT_MS } = {}) {
    let timer = null;
    let title = "";

    function stop() {
        if (timer === null) return;
        clearInterval(timer);
        timer = null;
        page.title = title;
        page.removeEventListener("visibilitychange", back);
    }

    function back() {
        if (!page.hidden) stop();
    }

    return {
        start(text) {
            if (!page?.hidden || timer !== null) return false;
            title = page.title;
            let shown = true;
            page.title = text;
            timer = setInterval(() => {
                shown = !shown;
                page.title = shown ? text : title;
            }, every);
            page.addEventListener("visibilitychange", back);
            return true;
        },

        stop,
    };
}
