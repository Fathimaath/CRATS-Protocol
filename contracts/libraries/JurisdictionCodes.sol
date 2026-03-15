// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

library JurisdictionCodes {

    uint16 internal constant UNKNOWN = 0;

    // Major jurisdictions
    uint16 internal constant US = 840;
    uint16 internal constant GB = 826;
    uint16 internal constant DE = 276;
    uint16 internal constant FR = 250;
    uint16 internal constant CH = 756;
    uint16 internal constant SG = 702;
    uint16 internal constant HK = 344;
    uint16 internal constant JP = 392;
    uint16 internal constant CN = 156;
    uint16 internal constant KR = 410;
    uint16 internal constant IN = 356;
    uint16 internal constant AU = 36;
    uint16 internal constant CA = 124;
    uint16 internal constant BR = 76;
    uint16 internal constant AE = 784;
    uint16 internal constant RU = 643;

    // Restricted jurisdictions
    uint16 internal constant KP = 408;
    uint16 internal constant IR = 364;
    uint16 internal constant SY = 760;
    uint16 internal constant CU = 192;

    function isRestricted(uint16 code) internal pure returns (bool) {
        return code == KP || code == IR || code == SY || code == CU;
    }

    function isValid(uint16 code) internal pure returns (bool) {
        return code > 0 && code < 1000;
    }
}