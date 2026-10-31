<template>
    <div id='page5'>
        <div class='aligner2'>
            <div class="aligner d-flex justify-content-top">
                <div style="margin-top:30px;" class="container-sm pepar">

                    <h2 class='h2_x' id="about">
                        Jungle v {{ version }}
                    </h2>
                    <p class="warning">
                        <Icon name="triangle-exclamation" /> WARNING: This is a decentralized browser game, a static single-page app pinned on IPFS. The source code is public and
                        malicious actors can publish illegal, compromised copies of the game: play only at <a href="https://jungle.didakoo.eth.limo/" target="_blank" rel="noopener noreferrer">jungle.didakoo.eth</a> (.limo ENS gateway)
                        or <a href="https://jungle.didakoo.com/" target="_blank" rel="noopener noreferrer">jungle.didakoo.com</a>.
                        Check the <a href="https://github.com/didakoo-hub/jungle" target="_blank" rel="noopener noreferrer">official GitHub repository</a> for more details.
                    </p>

                    <p class="warning">
                        If using MetaMask or Farcaster, never share your 12 or 24 word recovery phrase, not even with someone posing as support. The game never asks for it.
                    </p>

                    <p>&ensp;</p>

                    <h2 class='h2_x' id="how-to-play">
                        How to play
                    </h2>
                    <p>
                        Play as GUEST (even in a private window)
                        or with a <a href="https://metamask.io/" target="_blank" rel="noopener noreferrer">MetaMask</a> wallet on Polygon.
                        Jungle is also a Mini App on <a :href="miniAppLink" target="_blank" rel="noopener noreferrer">Farcaster</a>.
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
                        Special moves:
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
                    <p>&ensp;</p>

                    <h2 class='h2_x' id="modes">
                        Game modes
                    </h2>
                    <p>
                        Jungle has 3 modes. How they work, and which ones you can play, are different for GUESTS and for wallets.
                    </p>
                    <p>&ensp;</p>
                    <ul class="modes">
                        <li>
                            BOT: play against the computer.
                            Every match has a random difficulty, from LV 1 to <span class="text-nowrap">LV 7. <Icon name="bolt" /></span>
                        </li>
                        <li>
                            PRIVATE: press COPY LINK and share it with Player 2.
                        </li>
                        <li>
                            ARENA: play against a random opponent. Wallets <span class="text-nowrap">only. <Icon name="globe" /></span>
                        </li>
                    </ul>
                    <p>&ensp;</p>
                    <p class="modes-after">
                        Private and Arena matches between wallets are on-chain: every move is a transaction signed automatically.
                        Each player stakes 5&nbsp;POL for the gas, and the unspent POL is refunded when the match ends.
                    </p>
                    <p>
                        Winners holding a Jungle pass get a match token for every on-chain win.
                    </p>

                    <p>&ensp;</p>
                    <p>&ensp;</p>
                    
                    <h2 class="h2_x">
                        Collections
                    </h2>
                    <p>
                        NFT collections recognized by the game, and what they unlock:
                    </p>
                    <ul style='font-family: monospace;'>
                        <li><a href="https://opensea.io/collection/jungle-didakoo-pass" target="_blank" rel="noopener noreferrer">Jungle didakoo pass</a> (Polygon) - match token minting, profile colors, dog badge</li>
                        <li><a href="https://opensea.io/collection/jungle-didakoo-matches" target="_blank" rel="noopener noreferrer">Jungle didakoo matches</a> (Polygon) - match tokens</li>
                        <li><a href="https://opensea.io/collection/didakoo-items" target="_blank" rel="noopener noreferrer">didakoo items 2023</a> (Ethereum)</li>
                        <li><a href="https://opensea.io/collection/cryptokitties" target="_blank" rel="noopener noreferrer">CryptoKitties</a> (Ethereum) - cat badge</li>
                        <li><a href="https://opensea.io/collection/boredapeyachtclub" target="_blank" rel="noopener noreferrer">Bored Ape Yacht Club</a> (Ethereum) - monkey badge</li>
                    </ul>

                    <p>&ensp;</p>
                    <p>&ensp;</p>

                    <p>
                        <Icon name="copyright" /> 2026 didakoo. All rights reserved: code and artwork. 
                    </p>


                    <span style='color:white;' >
                         info@didakoo.com 
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>
<script>
import Icon from '../includes/Icon.vue'
import Trap from '../Game/Elements/Trap.vue'
import { animalSrc } from '../Game/Elements/boardAssets.js'
import { animals } from '../Game/constants.js'
import { REPETITION_LIMIT } from '../../engine/minimax.js'
import { TURN_SECONDS, PENALTY_SECONDS } from '../../game/timer.js'
import { MINIAPP_LINK } from '../../farcaster/constants.js'
import { GAME_VERSION } from '../../net/constants.js'

const COLOR_ANIMALS = 6
const COLOR_PREY = 2

export default {
    components: { Icon, Trap },
    data() {
        return {
            miniAppLink: MINIAPP_LINK,
            version: GAME_VERSION,
            animals: Object.values(animals).map((a) => ({
                name: a.name,
                power: a.power + 1,
                src: animalSrc(a.name, COLOR_ANIMALS),
            })),
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
    color: #ad5908;
}

h2.h2_x {
    font-size: 1.75rem;
}
h3.h3_x {
    font-size: 1.4rem;
    margin-top: 2rem;
    margin-bottom: 1.5rem;
}
.modes li + li {
    margin-top: 1rem;
}
.modes-after {
    margin-top: 1.5rem;
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
.plant {
    width: 30px;
    height: 30px;
    vertical-align: middle;
    position: relative;
    top: -3px;
}
</style>
