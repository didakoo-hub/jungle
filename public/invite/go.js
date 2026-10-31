(function () {
    var query = location.search.slice(1);
    location.replace(location.pathname.replace(/invite\/(index\.html)?$/, "") + (query ? "#/online?" + query : ""));
})();
