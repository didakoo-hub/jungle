<template>
    <nav v-if="pagesCount > 0" aria-label="Players list navigation">
        <ul class="pagination">
            <template v-for="(v, n) in entries">
                <li v-if="v.type === 'gap'" :key="'gap' + n" class="page-item page-gap">
                    <span class="page-link" aria-hidden="true">&hellip;</span>
                </li>
                <li
                    v-else
                    :key="v.type + v.page"
                    @click="press(v.i)"
                    class="page-item"
                >
                    <a
                        class="page-link"
                        :class="{
                            ' page-link-active': v.type === 'goto' && v.page === currentPage,
                            'page-link--selected': v.i === index,
                        }"
                        :aria-label="v.type === 'goto' ? null : v.type"
                    >
                        <span v-if="v.type === 'previous'" aria-hidden="true">&laquo;</span>
                        <span v-else-if="v.type === 'next'" aria-hidden="true">&raquo;</span>
                        <template v-else>{{ v.page }}</template>
                    </a>
                </li>
            </template>
        </ul>
    </nav>
</template>

<script>
const NEAR = 1;

export function pagesVisible(current, total) {
    const choices = new Set([1, total]);
    for (let p = current - NEAR; p <= current + NEAR; p++) {
        if (p >= 1 && p <= total) choices.add(p);
    }
    const sorted = [...choices].sort((a, b) => a - b);
    const pages = [];
    sorted.forEach((p, i) => {
        const before = sorted[i - 1];
        if (before !== undefined && p - before === 2) pages.push(p - 1);
        pages.push(p);
    });
    return pages;
}

export default {
    name: "PlayersPagination",
    props: {
        currentPage: {
            type: Number,
            required: true,
        },
        pagesCount: {
            type: Number,
            required: true,
        },
    },
    data() {
        return {
            index: null,
        };
    },
    computed: {
        targets() {
            const list = [];
            if (this.currentPage > 1) list.push({ type: "previous", page: this.currentPage - 1 });
            for (const page of pagesVisible(this.currentPage, this.pagesCount)) list.push({ type: "goto", page });
            if (this.currentPage < this.pagesCount) list.push({ type: "next", page: this.currentPage + 1 });
            return list;
        },
        entries() {
            const entries = [];
            this.targets.forEach((b, i) => {
                const before = entries[entries.length - 1];
                if (b.type === "goto" && before?.type === "goto" && b.page - before.page > 1) entries.push({ type: "gap" });
                entries.push({ ...b, i });
            });
            return entries;
        },
        lit() {
            return this.index !== null;
        },
    },
    watch: {
        currentPage() {
            if (this.lit) this.index = this.targets.findIndex((b) => b.type === "goto" && b.page === this.currentPage);
        },
    },
    methods: {
        switchOn() {
            this.index = this.targets.findIndex((b) => b.type === "goto" && b.page === this.currentPage);
        },
        switchOff() {
            this.index = null;
        },
        shift(step) {
            const where = this.index + step;
            if (where >= 0 && where < this.targets.length) this.index = where;
        },
        press(i = this.index) {
            const b = this.targets[i];
            if (!b) return;
            if (b.type === "goto") this.$emit("goto", b.page);
            else this.$emit(b.type);
        },
    },
};
</script>

<style scoped>
.pointer {
    cursor: pointer;
}
.pagination {
    background-color: transparent !important;
    justify-content: center;
    margin-top: 20px;
}
.page-link {
    background-color: transparent !important;
    color: white !important;
    border: none !important;
}
.page-link-active {
    color: #a225f0 !important;
    border: none !important;
}
.page-link--selected {
    outline: 2px solid #ffffff;
    outline-offset: -2px;
}
.page-item {
    border: none !important;
    outline: none !important;
    cursor: pointer !important;
}
</style>
