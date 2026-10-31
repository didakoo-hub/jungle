(function () {
    var query = location.search.slice(1);
    if (/(^|&)challenge=/.test(query)) history.replaceState(null, "", location.pathname + "#/online?" + query);
    var framed;
    try {
        framed = window.parent !== window.self;
    } catch (e) {
        framed = true;
    }
    var metamask = /MetaMaskMobile/.test(navigator.userAgent);
    if (location.origin !== "https://jungle.didakoo.com" || framed || (window.ReactNativeWebView && !metamask)) return;
    location.replace("https://jungle.didakoo.eth.limo/" + location.hash);
})();
