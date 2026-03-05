import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as L from "leaflet";
import DataSetInterfaces = ComponentFramework.PropertyHelper.DataSetApi;
type DataSet = ComponentFramework.PropertyTypes.DataSet;

export class osmpcfcomponent implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private _container: HTMLDivElement;
    private _mapContainer: HTMLDivElement;
    private _map: L.Map | null = null;
    private _markers: L.FeatureGroup;
    private _notifyOutputChanged: () => void;

    // Outputs
    private _selectedLabel: string | null = null;
    private _selectedPinID: string | null = null;
    private _selectedLat: number | null = null;
    private _selectedLng: number | null = null;
    private _isMapInitialized = false;

    /**
     * Empty constructor.
     */
    constructor() {
        // Empty
    }

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary,
        container: HTMLDivElement
    ): void {
        this._container = container;
        this._notifyOutputChanged = notifyOutputChanged;

        // Create the map container div
        this._mapContainer = document.createElement("div");
        this._mapContainer.className = "osm-map-container";
        this._container.appendChild(this._mapContainer);
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        const dataset = context.parameters.mapDataset;

        if (dataset.loading) {
            return;
        }

        // Initialize map only once the container has physical dimensions (often 0 on first init)
        if (!this._isMapInitialized && this._mapContainer.clientHeight > 0) {
            this.initializeMap(context);
        }

        if (this._isMapInitialized && dataset) {
            // Leaflet often struggles if the container size changes after initialization
            // PowerApps Canvas layouts can dynamically resize components
            if (this._map) {
                this._map.invalidateSize();
            }
            this.renderMarkers(dataset);
        }
    }

    private initializeMap(context: ComponentFramework.Context<IInputs>): void {
        // Build map
        this._map = L.map(this._mapContainer, {
            center: [0, 0],
            zoom: 2
        });

        // Determine Tile Server URL
        // If the user provided a custom URL via the properties pane, use it. Otherwise default to public OSM.
        let tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

        // Check if the property exists and has a value
        const customUrl = context.parameters.TileServerURL?.raw;
        if (customUrl && customUrl.trim().length > 0) {
            tileUrl = customUrl.trim();
        }

        // Add tiles to map
        L.tileLayer(tileUrl, {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(this._map);

        // Group to hold all markers for easy bounds calculation and clearing
        this._markers = L.featureGroup().addTo(this._map);

        this._isMapInitialized = true;
    }

    private renderMarkers(dataset: DataSet): void {
        if (!this._map || !this._markers || !dataset) return;

        this._markers.clearLayers();

        const recordIds = dataset.sortedRecordIds;
        if (!recordIds || recordIds.length === 0) return;

        let hasValidCoordinates = false;

        // Helper to unwrap PowerApps dataset objects which wrap primitives
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const unwrap = (v: any) => {
            if (v == null) return null;
            if (typeof v === "object") {
                if ("raw" in v) return v.raw;
                if ("value" in v) return v.value;
            }
            return v;
        };

        console.log("OSMPCF Dataset Columns:", dataset.columns);

        recordIds.forEach(id => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const record = dataset.records[id] as any;

            // Use the manifest property-set names first, unwrapping any object shapes
            const latRaw = record.getValue("Latitude");
            const lngRaw = record.getValue("Longitude");
            const labelRaw = record.getValue("PinLabel");
            const colorRaw = record.getValue("PinColor");
            const pinIdRaw = record.getValue("PinID");

            let latVal: number | null = latRaw != null ? parseFloat(String(unwrap(latRaw))) : null;
            let lngVal: number | null = lngRaw != null ? parseFloat(String(unwrap(lngRaw))) : null;
            let labelVal: string = labelRaw != null ? String(unwrap(labelRaw)) : "";
            let colorVal: string | null = colorRaw != null ? String(unwrap(colorRaw)) : null;
            let pinIdVal: string | null = pinIdRaw != null ? String(unwrap(pinIdRaw)) : null;

            // Handle NaN from parseFloat
            if (latVal !== null && isNaN(latVal)) latVal = null;
            if (lngVal !== null && isNaN(lngVal)) lngVal = null;

            // If explicit mapping failed, fallback to heuristics
            if (latVal === null || lngVal === null) {
                // record._record has all the actual fields PowerApps passes us
                const rawFields = record._record ? record._record.fields : null;

                if (rawFields) {
                    for (const key in rawFields) {
                        const val = unwrap(rawFields[key]);
                        const keyLower = key.toLowerCase();

                        if (typeof val === "number" || (typeof val === "string" && !isNaN(parseFloat(val)))) {
                            const num = typeof val === "number" ? val : parseFloat(val);
                            // Independent checks: Only use pure range checks if key explicitly hints at it, 
                            // otherwise only grab it if lat/lng are still null to prevent taking the same number.
                            if (keyLower.includes("lat")) {
                                latVal = num;
                            } else if (keyLower.includes("lon") || keyLower.includes("lng")) {
                                lngVal = num;
                            } else {
                                // Last resort: strict range checks for unknown column names
                                if (num >= -90 && num <= 90 && latVal === null && lngVal !== num) {
                                    latVal = num;
                                } else if (num >= -180 && num <= 180 && lngVal === null && latVal !== num) {
                                    lngVal = num;
                                }
                            }
                        } else if (typeof val === "string") {
                            if (keyLower.includes("color")) {
                                colorVal = val;
                            } else if (keyLower.includes("name") || keyLower.includes("label")) {
                                labelVal = val;
                            } else if (keyLower === "id" || keyLower.includes("pinid")) {
                                pinIdVal = val;
                            }
                        }
                    }
                }
            }

            console.log(`OSMPCF Field Extractor [${id}]:`, { latVal, lngVal, labelVal, colorVal, rawRecord: record });

            if (latVal != null && lngVal != null) {
                const lat = typeof latVal === 'string' ? parseFloat(latVal) : (latVal as number);
                const lng = typeof lngVal === 'string' ? parseFloat(lngVal) : (lngVal as number);

                try {
                    // Finite bounds checking to prevent crashes
                    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
                    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

                    hasValidCoordinates = true;

                    // Always use divIcon (to bypass external PNG CSP blocks)
                    const color = colorVal && String(colorVal).trim() ? String(colorVal).trim() : "#2A81CB";

                    const markerHtmlStyles = `
                        background-color: ${color};
                        width: 2rem;
                        height: 2rem;
                        display: block;
                        left: -1rem;
                        top: -1rem;
                        position: relative;
                        border-radius: 2rem 2rem 0;
                        transform: rotate(45deg);
                        border: 1px solid #FFFFFF;
                        box-shadow: 0 1px 4px rgba(0,0,0,.35);
                    `;

                    const customIcon = L.divIcon({
                        className: "custom-pin",
                        iconAnchor: [16, 32],
                        popupAnchor: [0, -32],
                        html: `<span style="${markerHtmlStyles}"></span>`
                    });

                    const marker = L.marker([lat, lng], { icon: customIcon });

                    if (labelVal) {
                        let popupContent = labelVal;

                        try {
                            const parsedObj = JSON.parse(labelVal);
                            if (parsedObj && typeof parsedObj === "object") {
                                popupContent = "<table style='width: 100%; border-collapse: collapse; font-family: sans-serif; font-size: 13px;'><tbody>";
                                for (const [key, value] of Object.entries(parsedObj)) {
                                    popupContent += `<tr><td style='padding: 4px; border-bottom: 1px solid #ddd; font-weight: bold;'>${key}</td><td style='padding: 4px; border-bottom: 1px solid #ddd;'>${value}</td></tr>`;
                                }
                                popupContent += "</tbody></table>";
                            }
                        } catch (e) {
                            // If it's not valid JSON, just leave the popupContent as the raw string
                        }

                        marker.bindPopup(popupContent);
                    }

                    // Handle map clicks
                    marker.on('click', () => {
                        this._selectedLabel = labelVal || null;
                        this._selectedPinID = pinIdVal || null;
                        this._selectedLat = lat;
                        this._selectedLng = lng;

                        // 1. Tell PowerApps which row in the Dataset was selected.
                        // This natively triggers the exact same `OnSelect` behavior as a Gallery.
                        dataset.setSelectedRecordIds([id]);

                        // 2. Tell PCF that our custom Outputs (SelectedLabel etc) have changed.
                        this._notifyOutputChanged();

                        marker.openPopup();
                    });

                    this._markers.addLayer(marker);
                } catch (e) {
                    console.warn("OSMPCF Marker render failed for record", id, e);
                }
            }
        });

        // Adjust map to fit all markers
        if (hasValidCoordinates) {
            this._map.fitBounds(this._markers.getBounds(), { padding: [50, 50], maxZoom: 15 });
        }
    }

    public getOutputs(): IOutputs {
        return {
            SelectedPinID: this._selectedPinID || undefined,
            SelectedLabel: this._selectedLabel || undefined,
            SelectedLatitude: this._selectedLat != null ? this._selectedLat : undefined,
            SelectedLongitude: this._selectedLng != null ? this._selectedLng : undefined
        };
    }

    public destroy(): void {
        if (this._map) {
            this._map.remove();
            this._map = null;
        }
    }
}
