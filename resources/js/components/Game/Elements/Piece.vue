<template>
    <g
        class="chesspiece"
        :class="pieceTransformStyles"
        @animationend="$emit('settled')"
    >
        <svg
            :x="x"
            :y="y"
            :width="width"
            :height="height"
            :viewBox="viewPort"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <image class="animal" :href="animalSrc(name, avatarColor, water)" :style="imageStyle"></image>
        </svg>
    </g>
</template>
<script>
import { animalSrc } from "./boardAssets.js";
import { PIECE_SCALE, boardFrame } from "./pieceFrame.js";

export default {
    methods: { animalSrc },
    props: {
        name: {
            type: String,
            required: true,
        },
        x: {
            type: Number,
            required: true,
        },
        y: {
            type: Number,
            required: true,
        },
        transformX: {
            type: Number,
            required: false,
        },
        transformY: {
            type: Number,
            required: false,
        },
        isMoves: {
            type: Boolean,
            required: false,
        },
        width: {
            type: Number,
            required: true,
        },
        height: {
            type: Number,
            required: true,
        },
        avatarColor: Number,
        water: {
            type: Boolean,
            default: false,
        },
    },
    computed: {
        viewPort() {
            const { x, y, size } = boardFrame(this.name);
            return `${x} ${y} ${size} ${size}`;
        },
        imageStyle() {
            const { center, middle } = boardFrame(this.name);
            return { transformOrigin: `${center}px ${middle}px`, "--piece-scale": PIECE_SCALE };
        },
        pieceTransformStyles() {
            if (this.isMoves) {
                let className = "";
                if (this.transformX) {
                    switch (this.transformX) {
                        case 80:
                            className = "animation-to-right";
                            break;
                        case 240:
                            className = "animation-to-right-2x";
                            break;
                        case -80:
                            className = "animation-to-left";
                            break;
                        case -240:
                            className = "animation-to-left-2x";
                            break;
                    }
                    return className;
                } else if (this.transformY) {
                    switch (this.transformY) {
                        case 80:
                            className = "animation-to-bottom";
                            break;
                        case 320:
                            className = "animation-to-bottom-2x";
                            break;
                        case -80:
                            className = "animation-to-top";
                            break;
                        case -320:
                            className = "animation-to-top-2x";
                            break;
                    }
                    return className;
                }
                return "";
            }
            return {};
        },
    },
};
</script>
<style>
svg image {
    width: 100%;
}
.chesspiece image.animal {
    width: 400px;
    height: 400px;
    transform: scale(var(--piece-scale));
}
@media (max-width: 599px), (max-height: 599px) {
    .chesspiece image.animal {
        transform: none;
    }
}
.animation-to-left {
    animation: moveToLeft 0.3s ease-in;
}
.animation-to-left-2x {
    animation: moveToLeft2X 0.5s ease-in;
}
.animation-to-right {
    animation: moveToRight 0.3s ease-in;
}
.animation-to-right-2x {
    animation: moveToRight2X 0.5s ease-in;
}
.animation-to-top {
    animation: moveToTop 0.3s ease-in;
}
.animation-to-top-2x {
    animation: moveToTop2X 0.5s ease-in;
}
.animation-to-bottom {
    animation: moveToBottom 0.3s ease-in;
}
.animation-to-bottom-2x {
    animation: moveToBottom2X 0.5s ease-in;
}

@keyframes moveToLeft {
    from {
        transform: translate(80px, 0);
    }
    to {
        transform: translate(0, 0);
    }
}
@keyframes moveToLeft2X {
    from {
        transform: translate(240px, 0);
    }
    to {
        transform: translate(0, 0);
    }
}

@keyframes moveToRight {
    from {
        transform: translate(-80px, 0);
    }
    to {
        transform: translate(0, 0);
    }
}
@keyframes moveToRight2X {
    from {
        transform: translate(-240px, 0);
    }
    to {
        transform: translate(0, 0);
    }
}

@keyframes moveToTop {
    from {
        transform: translate(0, 80px);
    }
    to {
        transform: translate(0, 0);
    }
}
@keyframes moveToTop2X {
    from {
        transform: translate(0, 320px);
    }
    to {
        transform: translate(0, 0);
    }
}

@keyframes moveToBottom {
    from {
        transform: translate(0, -80px);
    }
    to {
        transform: translate(0, 0);
    }
}
@keyframes moveToBottom2X {
    from {
        transform: translate(0, -320px);
    }
    to {
        transform: translate(0, 0);
    }
}
</style>
