// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface ICarbonRegistry {

    // ── Registry Identification ──────────────────────────────
    enum RegistryType {
        VERRA,          // Verified Carbon Standard (VCU)
        GOLD_STANDARD,  // Gold Standard (VER/GS-VER)
        PURO,           // Puro.earth (CORC)
        ACR,            // American Carbon Registry (ERTs)
        CAR,            // Climate Action Reserve (CRTs)
        GCC,            // Global Carbon Council (GCCUs)
        OTHER           // Any future/regional registry
    }

    // ── Project Types (aligned with VCS sectoral scopes) ─────
    enum ProjectType {
        AFOLU_REDD,         // Reducing Emissions from Deforestation (REDD+)
        AFOLU_ARR,          // Afforestation, Reforestation, Revegetation
        AFOLU_IFM,          // Improved Forest Management
        AFOLU_ALM,          // Agricultural Land Management
        AFOLU_WRC,          // Wetlands / Blue Carbon
        AFOLU_ACoGS,        // Avoided Conversion of Grasslands
        ENERGY_RENEWABLE,   // Renewable Energy
        ENERGY_EFFICIENCY,  // Energy Efficiency
        METHANE_CAPTURE,    // Landfill / livestock methane
        BIOCHAR,            // Biochar carbon removal
        DIRECT_AIR_CAPTURE, // DAC / engineered removal
        ENHANCED_WEATHERING,// Rock weathering
        BLUE_CARBON,        // Ocean/coastal carbon sinks
        COOKSTOVES,         // Clean cooking
        INDUSTRIAL,         // Industrial processes
        TRANSPORT,          // Transport emission reduction
        WASTE_MANAGEMENT,   // Waste reduction / circular economy
        OTHER
    }

    // ── Registry Sync States ─────────────────────────────────
    enum RegistrySyncStatus {
        PENDING,     // Import requested, not yet confirmed
        VERIFIED,    // Registry has confirmed the serial range
        IMPORTED,    // Metadata fully imported
        TOKENIZED,   // ERC-3643 token minted on CRATS
        SUSPENDED,   // Registry suspended this project/batch
        RETIRED,     // Fully retired on registry
        CANCELLED    // Cancelled by registry or compliance
    }

    // ── Credit Type ─────────────────────────────────────────
    enum CreditType {
        REDUCTION,      // Emission reduction credit
        REMOVAL,        // Carbon removal credit (CDR)
        AVOIDANCE       // Avoided emission credit
    }

    // ── ICVCM / CCP Status ───────────────────────────────────
    enum CCPStatus {
        NOT_ASSESSED,   // Not yet reviewed by ICVCM
        ELIGIBLE,       // Program is CCP-eligible
        APPROVED,       // Specific methodology is CCP-approved
        CONDITIONAL,    // Approved with remedial conditions
        REJECTED        // Failed CCP assessment
    }
}
