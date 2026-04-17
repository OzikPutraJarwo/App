# Plan for Updates / Bug Fixes

### Feb 10, 2026

- [x] `User & Auth` Token auto-refresh system & extended token to 60 minutes
- [x] `User & Auth` Auth-aware sync with auto re-login
- [x] `User & Auth` Granular GDrive structure for multi-save data without conflict
- [x] `User & Auth` Almost-real-time data update and exchange (and check for quotas, too)
- [x] `Inventory > Crops` Lines quantity consumed via per-trial created
- [x] `Inventory > Parameters` Change "Quantity" to "Number of Sample"
- [x] `Inventory > Parameters` Range definition using 2 column (min - max)
- [x] `Inventory > Parameters` No unit compability
- [x] `Inventory > Parameters` Insert photo for question per sample/line radio
- [x] `Inventory > Parameters` New type: Formula, a calculate parameters with custom formula
- [x] `Trial > Trial Management` Archived trials
- [x] `Trial > Trial Management` General: List for selected param and line with 2 columns, draggable
- [x] `Trial > Trial Management` General: Add number of rows per plot (number)
- [x] `Trial > Trial Management` General: Add plot length (number)
- [x] `Trial > Trial Management` General: Add plant spacing (number, 2 column, width * height in cm)
- [x] `Trial > Trial Management` General: Add plot area (no of rows per plot * plot length * plant spacing width)
- [x] `Trial > Trial Management` General: Add expected number of plants per plot
- [x] `Trial > Trial Management` General: Population per ha (10000m^2 / plant spacing in m)
- [x] `Trial > Trial Management` Location: no city names on map
- [x] `Trial > Trial Management` Location: centered to Indonesia, not to Jakarta
- [x] `Trial > Trial Management` Location: no city names select
- [x] `Trial > Trial Management` Layouting: change .layouting-row-header innerText from "Rn" to "Range n"
- [x] `Trial > Trial Management` Layouting: add "Replication n" to every .layouting-table
- [x] `Trial > Trial Management` Layouting: List for selected lines, same customization as list for selected param
- [x] `Trial > Run Trial` Auto save progress everytime click next/prev
- [x] `Trial > Run Trial` Popup "are you sure?" message everytime move to another line
- [x] `Trial > Run Trial` Popup "are you sure?" with autosave when #runTrialBackBtn clicked
- [x] `Reminder` Add new navigation, with Agronomy and Observation submenu

### Feb 21, 2026

- [x] `SPECTRA` Init
- [x] `Trial` Click on trial item > Detail, Run Observation, Agronomy Monitoring
- [x] `Trial` Trial detail modal: Lines list per areas
- [x] `Trial` Run Observation: After last question UI
- [x] `Trial` Run Observation: Take photo for photo upload
- [x] `Trial` Run Observation: Preview photo after uploaded
- [x] `Trial` Agronomy Monitoring: Per area, table [Activity, DAP, Date, Chemical, Dose, Remark]
- [x] `Trial` Agronomy Monitoring: Fieldbook: Actual Application Date, Photo
- [x] `Inventory` Import and export system
- [x] `Inventory > Parameters` Last updated per param
- [x] `Inventory > Parameters` Days of Observation per crop, with range
- [x] `Inventory > Parameters` Filter per crop
- [x] `Inventory > Agronomy` Agronomy scheduler
- [x] `Inventory > Agronomy` Crop, Activity, DAP, Chemical, Dose, Remark
- [x] `Reminder > Observation` Reminders for data retrieval per parameters
- [x] `Reminder > Agronomy` Reminders for agronomy things (fertilizing, spraying, etc)
- [x] `Dashboard` Reminder linking

### Feb 24, 2026

#### Update
- [x] `Inventory > Crops` Import and export using Excel/CSV
- [x] `Trial > Report` Per-trial complete information
- [x] `Trial > Edit, Detail` Experimental design
- [x] `Inventory > Parameters` Formula type definition
#### Bug Fixes and Redesigns
- [x] `syncPanel` animation and position
- [x] Progress bar for Agronomy in `Dashboard` and `Trial`
- [x] Empty state grid columns
- [x] `Reminder > Agronomy` progress bug with no photo
- [x] Toast redesign
- [x] Missing preview map on `Trial > Edit/New`
- [x] Days of Observation on import and export in `Inventory > Parameters`
- [x] Remove .modal-header from Create and Edit Trial
- [x] Edit trial selected parameters bug (now showing all, only with DoO)

### Mar 1, 2026

#### Update
- [x] `Inventory > Crops` Update with Hybrid
- [x] `Trial` Planting Seasons
- [x] `Trial` No. of Factors, Treatments
- [x] `Trial` Type of Pollination
- [x] `Trial` Add more details
- [x] `Trial` Download detail as PDF
- [x] `Trial` Remove Lines Name
- [x] `Trial` Custom layouting
- [x] `Database` All data
- [x] `Data Analysis` Beta releases
- [x] New CropID navigation
- [x] `Data Analysis` CRD, RCBD, and LSD with multiple factors (up to 3)
- [x] `Data Analysis` Anova with Post Hoc: Fischer, Tukey, Duncan, SNK, and SK
- [x] `Data Analysis` t-Test, Path Analysis, and GGE Biplot
#### Bug Fixes and Redesigns
- [x] Automatic logout when error initializing happened
- [x] Planting date per location, not per trial
- [x] Dashboard reminders real-time update problem
- [x] Map not showing in production
- [x] Some flex adjustments
- [x] Checkbox for dragable
- [x] Planting date optional
- [x] No layout trial
- [x] Serpentine fixes
- [x] `.layouting-table-wrap` width scroll fix
- [x] `Inventory > Parameters` default sort by last updated
- [x] `Trial` new/edit modal and move to another nav fullscreen bug fixes
- [x] Missing selected entries on saved trials when edited
- [x] New drive format (SPECTRA)
- [x] Change `Hybrid Name` to `Hybrid Code` for Parental and Hybrid crop entries
- [x] `Database` big updates
- [x] `Sync Queue` with time
- [x] `Sync Queue` Smart syncing by syncing trials only the meta, response following
- [x] `Data Analysis` JS restructured
- [x] `Data Analisis` redesign with dynamic split, filter bug, etc

## Mar 17, 2026

### Update
- [x] `MAIN` New logo
- [x] `Trial` Factors using Entries
- [x] `Trial` Process Research with split plot design for factorial with custom layouting
- [x] `Trial` Report with import/export system
- [x] `Trial` Parent Test with selected entries
- [x] `Trial` Copy entries
- [x] `Data Analysis` Custom dataset (independent)
- [x] `Data Analysis` ANOVA with Coefficient of Variation (CV)
### Bug Fixes and Redesigns
- [x] `MAIN` Remove CropID
- [x] `Trial` Bug in inaccurate first point of map
- [x] `Etc` Changes the map from Stadia Maps to Esri World Imagery

## Mar 29, 2026

### Update
- [x] `User Settings` New logo and description
- [x] `User Settings` Optimization for inventory's data and trials
- [x] `User Settings` Data cache change from localStorage to IndexedDB
- [x] `User Settings` Checking for new data mechanism
- [x] `User Settings` User authority (Field User, SuperUser)
- [x] `User Settings > Notifications` Added
- [x] `Inventory` Find for every items
- [x] `Inventory` Folders for every items
- [x] `Inventory > Parameter` Formula type use DoO too
- [x] `Trial` Load data per area/location
- [x] `Trial` Save data per replication
- [x] `Trial` Report format as dataset (params on the right side per column)
- [x] `Trial > Observation` Remark for every answer
- [x] `Trial > Observation` Save image as separated binary file
- [x] `Library` Submenu for trial photos
- [x] `Database` Removed
- [x] `Data Analysis > Dataset` Load gradually with load more
### Bug Fixes, Redesign, etc
- [x] `Inventory` Grid and list layout
- [x] `Inventory > Parameters` Delete button for DoO
- [x] `Inventory > Parameters` Crop name with entry type
- [x] `Inventory > Parameters` Better UI/UX for formula list (find etc, on the left wing)
- [x] `Trial > Run` Units for every answer
- [x] `Trial > Run` .run-nav-area overflow bug on phone
- [x] `Trial > Report` Right toolbar bug
- [x] `Trial > Report` Redesign

# Apr 12, 2026
- [x] `All` Responsiveness and UI redesign
- [x] `User Settings` Auto relogin every 45 minutes
- [x] `Inventory` Assign items to more than one folder
- [x] `Trial` Choose parameter's folder
- [x] `Library > Trial Photos` Faster loading
- [x] `Library > Trial Photos` More detailed name
- [x] `Reminder > Observation` Integration with parameters with formula
- [x] `Data Analysis` Custom dataset with sheet selection

# Apr 14, 2026
- [x] `User Settings` New optimization for trial and it's images
- [x] `Library > Observation Photos` Changed name
- [x] `Library > Agronomy Photos` Init
- [x] `Library > Observation; Agronomy Photos` More detailed folder
- [x] `Trial` Run per area
- [x] `Trial` Run Observation; Agronomy per type (answer or photos only)
- [x] `Trial > Observation; Agronomy` Upload image more than one once
- [x] Some small redesigns (`Library`, `Trial`)

# Apr 16, 2026
- [x] `App > Loading` Logout button on loading screen (appears after 4s idle)
- [x] `App > Loading` Logout options: Logout Only / Logout & Clear All Data with IndexedDB cleanup
- [x] `Trial > Run Observation` Accurate save feedback — manual save shows "saved to cloud" only after Drive upload succeeds
- [x] `Trial > Agronomy` Accurate save feedback — manual save shows "saved to cloud" only after Drive upload succeeds
- [x] `Trial > Run Observation` Dirty-flag coalescing — rapid interactions no longer silently drop saves (uses flag + re-save pattern)
- [x] `Trial > Agronomy` Dirty-flag coalescing — rapid interactions no longer silently drop saves (uses flag + re-save pattern)
- [x] `Sync Queue` Persistent sync queue to IndexedDB — pending Drive uploads survive app close & mobile background kill
- [x] `Sync Queue` Resume pending saves on app launch with user notification (displays count of resumed tasks)
- [x] `Sync Queue` Merge-before-overwrite for observation data — fetches remote, merges by timestamp, unions photos
- [x] `Sync Queue` Merge-before-overwrite for agronomy data — fetches remote, merges by timestamp, unions photos
- [x] `Sync Queue` Automatic retry on failed sync (up to 2x with exponential back-off)
- [x] `Sync Queue` Skip-all on auth expiry — no silent failures or dropped data
- [x] `Network` Offline detection — pauses sync when offline, auto-resumes when reconnected
- [x] `Network` Offline toast notification when sync blocked by connectivity
- [x] `Network` Urgent save on visibility change — flushes in-progress agronomy/observation work to IndexedDB cache
- [x] `Network` Urgent save on pagehide event — safeguard against mobile browser killing the app
- [x] `App > Cache` `clearLocalCache()` now also clears all dirty sync markers for fresh state
- [x] `Sync Queue` `enqueueSync()` now returns Promise — callers can await actual Drive completion

## UPCOMING PLANS
- [ ] Resize/reformat uploaded image dashboard
- [ ] Reminder > checkbox > run only shows the checked
