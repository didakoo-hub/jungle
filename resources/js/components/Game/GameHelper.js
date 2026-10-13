import { waterCodes, boardColors } from "./constants.js";
import { generator, shuffle } from "../../game/random.js";
export default {
    getSquareCode(row, col) {
        let rowMapping = ["9", "8", "7", "6", "5", "4", "3", "2", "1"];
        let colMapping = ["A", "B", "C", "D", "E", "F", "G"];

        return colMapping[col] + rowMapping[row];
    },
    getIndexesByCode(code) {
        let rowMapping = ["9", "8", "7", "6", "5", "4", "3", "2", "1"];
        let colMapping = ["A", "B", "C", "D", "E", "F", "G"];
        return {
            rowIndex: rowMapping.indexOf(code[1]),
            colIndex: colMapping.indexOf(code[0]),
        };
    },
    getSquareColor(row, col) {
        if (
            row > 2 &&
            row < 6 &&
            col !== 0 &&
            col !== 3 &&
            col !== 6
        )
            return "dark";
        else return "light";
    },

    getSquarePosition(row, col, option = {}) {
        return {
            x: col * option.square.width + option.padding,
            y: row * option.square.height,
        };
    },

    getInitialRandomState(rnd = Math.random) {
        const indexes = [0, 1, 2, 3, 4, 5, 6, 7];
        const whiteIndexes = shuffle(indexes, rnd);
        const blackIndexes = shuffle(indexes, rnd);

        const animalTypes = [
            "tiger",
            "lion",
            "cat",
            "dog",
            "elephant",
            "monkey",
            "leopard",
            "mouse"
        ]
        const res = {}
        let blackCodes = [
            "A9", "G9", "B8", "F8",
            "A7", "C7", "E7", "G7"
        ]
        let whiteCodes = [
            "A1", "G1", "B2", "F2",
            "A3", "C3", "E3", "G3"
        ]
        for (let i = 0; i < 8; i++){
            res[blackCodes[i]] = {
                color: "black",
                piece: animalTypes[blackIndexes[i]]
            }
            res[whiteCodes[i]] = {
                color: "white",
                piece: animalTypes[whiteIndexes[i]]
            }
        }
        return res;
    },

    getWaterCodes (){
        return waterCodes;
    },
    getInitialState(seed){
        return this.getInitialRandomState(generator(seed, "animals"))
    },
    getBoardColors(){
        return boardColors
    }
};
