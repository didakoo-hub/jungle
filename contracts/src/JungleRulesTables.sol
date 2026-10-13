// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

library JungleRulesTables {
    uint256 internal constant SQUARE_TYPE = 0x0000000000000000000000000000000002e002000001450514145000002002e0;

    uint256 internal constant SQUARE_SIDE = 0x000000000000000000000000000000003d5ffdffffffffffffffffffffcffc0f;

    uint256 internal constant RIVER_LEFT = 0x0000000000000000000000000000000000000000000000000000003060c00000;
    uint256 internal constant RIVER_RIGHT = 0x0000000000000000000000000000000000000000000000000000018306000000;

    uint256 internal constant BEATS = 0x5554155705570157005700170007c003;

    uint8 internal constant SWIMS = 0x01;
    uint8 internal constant JUMPS_H = 0x60;
    uint8 internal constant JUMPS_V = 0x60;

    uint8 internal constant MOUSE = 0;
}
