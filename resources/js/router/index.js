import VueRouter from "vue-router";
import DefaultContainer from "../components/layouts/DefaultContainer.vue";
import MatchesPage from "../components/pages/MatchesPage.vue";
import AvatarPage from "../components/pages/AvatarPage.vue";
import BoardGame from "../components/pages/BoardGame.vue";
import InfoPage from "../components/pages/InfoPage.vue";
import MenuPage from "../components/pages/MenuPage.vue";
import OnlinePage from "../components/pages/OnlinePage.vue";

const routes = [
    {
        path: "/",
        component: DefaultContainer,
        children: [
            { path: "", name: "matches", component: MatchesPage },
            { path: "matches", redirect: "/" },
            { path: "ranking", redirect: "/" },
            { path: "avatar", name: "avatar", component: AvatarPage },
            { path: "menu", name: "menu", component: MenuPage },
            { path: "info", name: "info", component: InfoPage },
        ],
    },
    { path: "/jungle", name: "jungle", component: BoardGame },
    { path: "/online", name: "online", component: OnlinePage },
];

const router = new VueRouter({
    mode: "hash",
    strict: true,
    routes: routes,
    scrollBehavior: () => ({ x: 0, y: 0 }),
});

export default router;
