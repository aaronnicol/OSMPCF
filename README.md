# OpenStreetMap PCF Component (OSMPCF)

A fully responsive, open-source PowerApps Component Framework (PCF) control that embeds an interactive OpenStreetMap into Canvas Apps and Model-Driven Apps without requiring a premium Maps connector or API keys.

## Features

- **No API Keys Required:** Natively uses standard OpenStreetMap tiles (free usage).
- **Custom Tile Servers:** Optionally configure mapping layers to commercial tile providers (like Mapbox, Google Maps, or custom GIS servers).
- **Custom Map Pins:** Bound dataset records automatically render as map pins.
- **Dynamic Pin Colors:** Define custom hex/CSS colors per row to categorize your map pins.
- **JSON Table Popups:** Click a pin to reveal an auto-formatted HTML table parsed seamlessly from any JSON string.
- **PowerApps Context Aware:** Natively triggers the Canvas `OnChange` event (via `dataset.setSelectedRecordIds`) so you can access `Self.Selected` context natively.
- **CSP Resilient:** Leaflet CSS is bundled directly into the component, and all map markers run dynamically via HTML `divIcon`, ensuring restrictive corporate Content Security Policies do not block external unpkg map assets.

## Installation / Import

To install the unmanaged pre-built solution directly into your Dataverse environment:
1. Download the latest `OSMPCF.zip` (found locally in `OSMPCF/bin/Debug/` if built locally).
2. Go to the Power Apps Maker Portal > Solutions.
3. Click **Import solution** and upload the ZIP.
4. Publish all customizations.
5. In your Canvas App, go to **Get more components** -> **Code** -> Select `osmpcfcomponent`.

## Usage in Canvas Apps

Once imported to your screen, construct a Collection in PowerFx to bind to the map.

```powerapps-dot
ClearCollect(
    colMapPins,
    {
        MyLat: -27.4698,
        MyLng: 153.0251,
        MyName: "{ ""Hospital"": ""Brisbane Royal"", ""Status"": ""Active"", ""Beds"": 420 }",
        MyColor: "#FF0000",
        MyPinID: "BRH-001"
    },
    {
        MyLat: -27.5698,
        MyLng: 152.9251,
        MyName: "{ ""Hospital"": ""Sunnybank Private"", ""Status"": ""Maintenance"", ""Beds"": 150 }",
        MyColor: "#0000FF",
        MyPinID: "SBP-002"
    }
)
```

1. Select the PCF Component on your screen.
2. In the Properties Pane, set the **Items** property to `colMapPins`.
3. Map the fields under the Component properties:
    - **Latitude:** `MyLat`
    - **Longitude:** `MyLng`
    - **Pin Label:** `MyName`
    - **Pin Color:** `MyColor`
    - **Pin ID:** `MyPinID` 

### Reading the Selected Pin
Do not use `OnSelect`. PCF datasets rely on internal state triggers.
Put your logic in the component's **`OnChange`** property:

```powerapps-dot
UpdateContext({ activeHospitalId: osmpcfcomponent.SelectedPinID });
```

*(Note: In newer PowerApps versions, you can also natively use `Self.Selected.MyPinID` in some contexts).*

## Developer Build Instructions

If you intend to modify the TypeScript code and compile your own solution, you will need Node.js and the Power Platform CLI (`pac`) installed.

1. Clone this repository.
2. Open a terminal in the root directory and install dependencies:
   ```bash
   npm install
   ```
3. Compile the web bundle:
   ```bash
   npm run build
   ```
4. Build the complete Dataverse Solution:
   ```bash
   cd OSMPCF
   dotnet build
   ```

The compiled solution will be deposited at `OSMPCF/bin/Debug/OSMPCF.zip`.
