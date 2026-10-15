<template>
    <div id='page5'>
        <div class='aligner2'>
            <div class="aligner d-flex justify-content-top">
                <div style="margin-top:30px;" class="container-sm pepar">

                    <h3 class='h2_x' id="about">
                        Jungle v 1.2
                    </h3>
                    <p class="warning">
                        <Icon name="triangle-exclamation" /> WARNING: This is a decentralized browser game, a static single-page app pinned on IPFS. The code is open source and
                        malicious actors can publish illegal, compromised copies of the game: play only at jungle.didakoo.eth (.limo ENS gateway)
                        or redirected from didakoo.com.
                        Check the <a href="https://github.com/didakoo-hub/jungle" target="_blank" rel="noopener noreferrer">official GitHub repository</a> for the source code and more details.
                    </p>

                    <p class="warning">
                        If using MetaMask, never share your Secret Recovery Phrase, not even with someone posing as support: the game will never ask for it.
                    </p>

                    <p>&ensp;</p>

                    <h2 class='h2_x' id="how-to-play">
                        How to play
                    </h2>
                    <p>
                        Play as a guest <img :src=Guest alt="guest" class="imgSize"> with NO WALLET, even in a private window, 
                        or with a <a href="https://metamask.io/" target="_blank" rel="noopener noreferrer">MetaMask</a> <img :src=Metamask alt="metamask" class="imgSize fox"> wallet on Polygon, 
                        which costs nothing to connect.
                        Keyboard and gamepad supported.
                    </p>

                    <p>&ensp;</p>

                    <h2 class='h2_x' id="animals">
                        Animals
                    </h2>
                    <p>
                        Jungle is a 1 vs 1 board game played on a 7 × 9 grid. 
                        Each player has 8 animals, each with a different strength.
                    </p>
                    <p>
                        The initial positions of the animals change with every match.
                    </p>

                    <p>&ensp;</p>

                    <div class="force">
                        <div v-for="a in animals" :key="a.name" class="force-entry">
                            <img :src="a.src" :alt="a.name" :class="{ mouse: a.name === 'mouse' }">
                            <span>{{ a.power }}</span>
                            <span>{{ a.name }}</span>
                        </div>
                    </div>
                    
                    <p>&ensp;</p>

                    <p>
                        On your turn you move one animal one square up, down, left or right, never diagonally.
                    </p>
                    <div class="move">
                        <div class="move-cross">
                            <svg class="arrow upon" viewBox="0 0 100 100"><path d="M50 4 92 46H68v50H32V46H8Z"/></svg>
                            <svg class="arrow left" viewBox="0 0 100 100"><path d="M50 4 92 46H68v50H32V46H8Z"/></svg>
                            <img class="move-piece" :src="predator" alt="leopard">
                            <svg class="arrow right" viewBox="0 0 100 100"><path d="M50 4 92 46H68v50H32V46H8Z"/></svg>
                            <svg class="arrow down" viewBox="0 0 100 100"><path d="M50 4 92 46H68v50H32V46H8Z"/></svg>
                        </div>
                        <img class="move-piece" :src="prey" alt="cat">
                    </div>
                    <p>
                        You have {{ turn }} seconds to make your move. If time runs out you skip the turn, 
                        and your next turn lasts {{ penalty }} seconds.
                    </p>
                    <p>
                        You cannot move the same animal more than {{ limit }} times in a row. 
                        After the {{ limit }}th move the animal becomes EXHAUSTED: for one turn it cannot move, and any opposing animal can eat it.
                    </p>
                    
                    <p>&ensp;</p>

                    <h3 class="h3_x" id="extra-moves">
                        Special moves :
                    </h3>
                    <ul>
                        <li>The Mouse eats the Elephant. The Elephant cannot eat the Mouse.</li>
                        <li>Only the Mouse can enter the water.</li>
                        <li>The Lion and the Tiger jump over the water.</li>
                        <li>A Mouse in the water blocks every jump across it.</li>
                    </ul>

                    
                    <p>&ensp;</p>

                    <h2 class='h2_x' id="plants">
                        Plants
                        <svg class="plant" viewBox="0 0 30 30"><Trap :x="0" :y="0" :width="30" :height="30" /></svg>
                    </h2>
                    <p>
                        Each player has 3 plants around their pyramid. Your own plants have no effect on your animals. 
                        An animal standing on an opponent's plant loses all of its power, and any defending animal can eat it.
                    </p>

                    <p>&ensp;</p>

                    <h2 class='h2_x' id="pyramids">
                        Pyramids
                    </h2>
                    <p>
                        The first animal that enters the opponent's pyramid wins the game.
                    </p>

                    
                    <p>&ensp;</p>

                    <h2 class='h2_x' id="modes-and-ranking">
                        Modes and Ranking
                    </h2>
                    <h3 class="h3_x">
                        Bot <Icon name="bolt" />
                    </h3>
                    <p>
                        Play against the computer. No wallet needed. 
                        Every match has a random bot level, from LV 1 to LV 7.
                    </p>
                    <h3 class="h3_x">
                        Private <img :src=Private alt="private" class="imgSize">
                    </h3>
                    <p>
                        Press COPY LINK and share it with Player 2 for a private match. 
                        Guests and wallets can't play against each other.
                    </p>
                    <ul>
                        <li>Guests play for free, with nothing at stake.</li>
                        <li>Wallets play on-chain: every move is a transaction signed by a session key, so MetaMask asks for confirmation only at the start of the match. To play this mode you need a Jungle pass token and stake 5 POL per match. The winner takes both players' stakes and gets a record token of the match.</li>
                    </ul>
                    <p>
                        Every record token held is a point in the ranking. 
                        Guest matches don't mint a record token.
                    </p>
                    <h3 class="h3_x">
                        Arena <Icon name="globe" />
                    </h3>
                    <p>
                        Play against a random opponent. Wallets only, on-chain like a private match, 
                        with the same requirements and rewards.
                    </p>

                    <p>&ensp;</p>
                    
                    <h2 class="h2_x">
                        Collections
                    </h2>
                    <p>
                        NFT collections recognized by the game, and what they unlock:
                    </p>
                    <ul style='font-family: monospace;'>
                        <li><a href="https://opensea.io/collection/jungle-didakoo-pass" target="_blank" rel="noopener noreferrer">Jungle didakoo pass</a> (Polygon) - pass, and the four extra colours</li>
                        <li><a href="https://opensea.io/collection/jungle-didakoo-records" target="_blank" rel="noopener noreferrer">Jungle didakoo records</a> (Polygon) - the record tokens</li>
                        <li><a href="https://opensea.io/collection/didakoo-items" target="_blank" rel="noopener noreferrer">didakoo items 2023</a> (Ethereum) - the animal badges, and the four extra colours</li>
                        <li><a href="https://opensea.io/collection/cryptokitties" target="_blank" rel="noopener noreferrer">CryptoKitties</a> (Ethereum) - cat badge</li>
                        <li><a href="https://opensea.io/collection/boredapeyachtclub" target="_blank" rel="noopener noreferrer">Bored Ape Yacht Club</a> (Ethereum) - monkey badge</li>
                    </ul>

                    <p>&ensp;</p>

                    <p>
                        <Icon name="copyright" /> 2026 didakoo. All rights reserved: code and artwork. 
                    </p>

                    <p>&ensp;</p>

                    <a href="https://github.com/didakoo-hub" target="_blank" rel="noopener noreferrer"><Icon name="github" style='font-size: 20px;  margin-left: 7px; color: white;' /></a>
                    <span style='color:white; margin-left: 3px;' >
                         info@didakoo.com 
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>
<script>
import Guest from '../../../images/extra_objects/ghost.svg'
import Metamask from '../../../images/extra_objects/MetaMask_Fox.svg'
import Private from '../../../images/extra_objects/iconaplay1.svg'
import Icon from '../includes/Icon.vue'
import Trap from '../Game/Elements/Trap.vue'
import { animalSrc, pyramidSrc } from '../Game/Elements/boardAssets.js'
import { animals } from '../Game/constants.js'
import { REPETITION_LIMIT } from '../../engine/minimax.js'
import { TURN_SECONDS, PENALTY_SECONDS } from '../../game/timer.js'

const COLOR_GUIDE = 1
const COLOR_ANIMALS = 6
const COLOR_PREY = 2

export default {
    components: { Icon, Trap },
    data() {
        return {
            Guest: Guest,
            Metamask: Metamask,
            Private: Private,
            animals: Object.values(animals).map((a) => ({
                name: a.name,
                power: a.power + 1,
                src: animalSrc(a.name, COLOR_ANIMALS),
            })),
            pyramid: pyramidSrc(COLOR_GUIDE),
            predator: animalSrc('leopard', COLOR_ANIMALS),
            prey: animalSrc('cat', COLOR_PREY),
            limit: REPETITION_LIMIT,
            turn: TURN_SECONDS,
            penalty: PENALTY_SECONDS
        }
    },
}
</script>
<style scoped>
.warning {
    color: #f6993f;
}
.warning a {
    color: inherit;
    text-decoration: underline;
}
.warning a:hover {
    color: #007bff;
}

h2.h2_x {
    font-size: 1.75rem;
}
h3.h3_x {
    font-size: 1.4rem;
    margin-top: 2rem;
    margin-bottom: 1.5rem;
}
.move {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    margin: 1.5rem 0;
}
.move-cross {
    display: grid;
    grid-template-columns: repeat(3, 58px);
    grid-template-rows: repeat(3, 58px);
    place-items: center;
}
.move-cross .upon {
    grid-area: 1 / 2;
}
.move-cross .left {
    grid-area: 2 / 1;
    transform: rotate(-90deg);
}
.move-cross .move-piece {
    grid-area: 2 / 2;
    width: 72px;
}
.move-cross .right {
    grid-area: 2 / 3;
    transform: rotate(90deg);
}
.move-cross .down {
    grid-area: 3 / 2;
    transform: rotate(180deg);
}
.arrow {
    width: 22px;
    height: 22px;
    fill: #fefffe;
}
.move-piece {
    width: 56px;
}
.force {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px 4px;
    margin-bottom: 1rem;
}
.force-entry {
    display: flex;
    flex-direction: column;
    align-items: center;
    color: white;
    font-family: monospace;
    text-transform: capitalize;
}
.force-entry img {
    width: 100%;
    max-width: 66px;
    height: 66px;
    object-fit: contain;
    object-position: center bottom;
}
.force-entry img.mouse {
    max-width: 54px;
}
.plant,
.pyramid {
    width: 30px;
    height: 30px;
    vertical-align: middle;
}
.plant {
    position: relative;
    top: -3px;
}
.imgSize{
    max-width: 20px;
    margin: 0;
    align-self: center;
    padding: 2px 0;
    position: relative;
    top: -2px;
}
.imgSize.fox {
    max-width: 24px;
}
</style>
