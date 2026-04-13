// Google Drive API Integration
const ADVANTA_FOLDER_NAME = "SPECTRA";
const INVENTORY_FOLDER_NAME = "Inventory";
const USER_SETTINGS_FOLDER_NAME = "UserSettings";
const USER_SETTINGS_FILE_NAME = "settings.json";
const CATEGORIES = ["Crops", "Entries", "Locations", "Parameters", "Agronomy"];

let driveState = {
  advantaFolderId: null,
  inventoryFolderId: null,
  userSettingsFolderId: null,
  categoryFolderIds: {},
};

function handleDriveAuthError(error, contextMessage = "Session expired") {
  if (typeof handleAuthExpiredError === "function") {
    return handleAuthExpiredError(error, contextMessage);
  }
  return false;
}

// Initialize Drive structure
async function initializeDriveStructure() {
  try {
    // Check/Create SPECTRA root folder
    driveState.advantaFolderId = await getOrCreateFolder(
      ADVANTA_FOLDER_NAME,
      null,
    );

    // Check/Create Inventory folder
    driveState.inventoryFolderId = await getOrCreateFolder(
      INVENTORY_FOLDER_NAME,
      driveState.advantaFolderId,
    );

    // Check/Create user settings folder
    driveState.userSettingsFolderId = await getOrCreateFolder(
      USER_SETTINGS_FOLDER_NAME,
      driveState.advantaFolderId,
    );

    // Check/Create category folders
    for (const category of CATEGORIES) {
      driveState.categoryFolderIds[category.toLowerCase()] =
        await getOrCreateFolder(category, driveState.inventoryFolderId);
    }

    return true;
  } catch (error) {
    handleDriveAuthError(error, "Google Drive session expired");
    console.error("Error initializing Drive structure:", error);
    throw error;
  }
}

async function upsertJsonFileInFolder(fileName, parentFolderId, data, knownExistingFile) {
  const fileContent = JSON.stringify(data ?? {}, null, 2);
  const existingFile = knownExistingFile || await findFile(fileName, parentFolderId);

  const boundary = "===============7330845974216740156==";
  const mimeType = "application/json";

  if (existingFile) {
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: fileName }) +
      "\r\n" +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n` +
      fileContent +
      "\r\n" +
      `--${boundary}--`;

    const xhr = new XMLHttpRequest();
    xhr.open(
      "PATCH",
      `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`,
      true,
    );
    xhr.setRequestHeader("Authorization", `Bearer ${getAccessToken()}`);
    xhr.setRequestHeader(
      "Content-Type",
      `multipart/related; boundary="${boundary}"`,
    );

    await new Promise((resolve, reject) => {
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send(body);
    });

    return true;
  }

  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: fileName, parents: [parentFolderId] }) +
    "\r\n" +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n` +
    fileContent +
    "\r\n" +
    `--${boundary}--`;

  const xhr = new XMLHttpRequest();
  xhr.open(
    "POST",
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    true,
  );
  xhr.setRequestHeader("Authorization", `Bearer ${getAccessToken()}`);
  xhr.setRequestHeader(
    "Content-Type",
    `multipart/related; boundary="${boundary}"`,
  );

  await new Promise((resolve, reject) => {
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(body);
  });

  return true;
}

async function saveUserSettingsToGoogleDrive(settings) {
  try {
    if (!driveState.advantaFolderId) {
      await initializeDriveStructure();
    }

    const folderId =
      driveState.userSettingsFolderId ||
      (await getOrCreateFolder(USER_SETTINGS_FOLDER_NAME, driveState.advantaFolderId));

    driveState.userSettingsFolderId = folderId;
    await upsertJsonFileInFolder(USER_SETTINGS_FILE_NAME, folderId, settings || {});
    return true;
  } catch (error) {
    handleDriveAuthError(
      error,
      "Google Drive session expired while saving user settings",
    );
    console.error("Error saving user settings to Google Drive:", error);
    throw error;
  }
}

async function loadUserSettingsFromGoogleDrive() {
  try {
    if (!driveState.advantaFolderId) {
      await initializeDriveStructure();
    }

    const folderId =
      driveState.userSettingsFolderId ||
      (await getOrCreateFolder(USER_SETTINGS_FOLDER_NAME, driveState.advantaFolderId));

    driveState.userSettingsFolderId = folderId;
    const file = await findFile(USER_SETTINGS_FILE_NAME, folderId);
    if (!file) return null;
    return await getFileContent(file.id);
  } catch (error) {
    handleDriveAuthError(
      error,
      "Google Drive session expired while loading user settings",
    );
    console.error("Error loading user settings from Google Drive:", error);
    throw error;
  }
}

async function saveInventoryFoldersToGoogleDrive(folders) {
  try {
    if (!driveState.inventoryFolderId) {
      await initializeDriveStructure();
    }
    await upsertJsonFileInFolder("_folders.json", driveState.inventoryFolderId, folders || {});
    return true;
  } catch (error) {
    handleDriveAuthError(error, "Google Drive session expired while saving folders");
    console.error("Error saving inventory folders to Google Drive:", error);
    throw error;
  }
}

async function loadInventoryFoldersFromGoogleDrive() {
  try {
    if (!driveState.inventoryFolderId) {
      await initializeDriveStructure();
    }
    const file = await findFile("_folders.json", driveState.inventoryFolderId);
    if (!file) return null;
    return await getFileContent(file.id);
  } catch (error) {
    handleDriveAuthError(error, "Google Drive session expired while loading folders");
    console.error("Error loading inventory folders from Google Drive:", error);
    throw error;
  }
}

// Get or create folder in Google Drive
async function getOrCreateFolder(folderName, parentFolderId = null) {
  try {
    // First, try to find existing folder
    const folder = await findFolder(folderName, parentFolderId);
    if (folder) {
      return folder.id;
    }

    // If not found, create new folder
    const folderId = await createFolder(folderName, parentFolderId);
    return folderId;
  } catch (error) {
    handleDriveAuthError(error, `Google Drive session expired while accessing ${folderName}`);
    console.error(`Error getting or creating folder ${folderName}:`, error);
    throw error;
  }
}

// Find folder by name
async function findFolder(folderName, parentFolderId = null) {
  try {
    let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

    if (parentFolderId) {
      query += ` and '${parentFolderId}' in parents`;
    }

    const response = await gapi.client.drive.files.list({
      q: query,
      spaces: "drive",
      fields: "files(id, name)",
      pageSize: 10,
    });

    const files = response.result.files || [];
    return files.length > 0 ? files[0] : null;
  } catch (error) {
    handleDriveAuthError(error, `Google Drive session expired while finding ${folderName}`);
    console.error(`Error finding folder ${folderName}:`, error);
    throw error;
  }
}

// Create folder in Google Drive
async function createFolder(folderName, parentFolderId = null) {
  try {
    const fileMetadata = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    };

    if (parentFolderId) {
      fileMetadata.parents = [parentFolderId];
    }

    const response = await gapi.client.drive.files.create({
      resource: fileMetadata,
      fields: "id",
    });

    return response.result.id;
  } catch (error) {
    handleDriveAuthError(error, `Google Drive session expired while creating ${folderName}`);
    console.error(`Error creating folder ${folderName}:`, error);
    throw error;
  }
}

// ===========================
// ENTRIES: per-crop file helpers
// Each crop's entries are stored in Entries/{cropId}.json as an array
// ===========================

async function saveEntryToDrive(entry) {
  const cropId = entry.cropId || entry.crop;
  if (!cropId) throw new Error("Entry missing cropId");
  const parentFolderId = driveState.categoryFolderIds["entries"];
  if (!parentFolderId) throw new Error("Entries folder ID not found");
  const fileName = `${cropId}.json`;

  // Read existing entries for this crop
  let cropEntries = [];
  const existingFile = await findFile(fileName, parentFolderId);
  if (existingFile) {
    try {
      const content = await getFileContent(existingFile.id);
      cropEntries = Array.isArray(content) ? content : [];
    } catch (_) { cropEntries = []; }
  }

  // Upsert: replace existing or push new
  const idx = cropEntries.findIndex(e => e.id === entry.id);
  if (idx >= 0) {
    cropEntries[idx] = entry;
  } else {
    cropEntries.push(entry);
  }

  await upsertJsonFileInFolder(fileName, parentFolderId, cropEntries);
  return true;
}

async function saveAllEntriesToDrive(entries) {
  const parentFolderId = driveState.categoryFolderIds["entries"];
  if (!parentFolderId) throw new Error("Entries folder ID not found");

  // Group entries by cropId
  const byCrop = {};
  for (const entry of entries) {
    const cropId = entry.cropId || entry.crop;
    if (!cropId) continue;
    if (!byCrop[cropId]) byCrop[cropId] = [];
    byCrop[cropId].push(entry);
  }

  for (const [cropId, cropEntries] of Object.entries(byCrop)) {
    await upsertJsonFileInFolder(`${cropId}.json`, parentFolderId, cropEntries);
  }
  return true;
}

async function deleteEntryFromDrive(entryId, entriesFolderId) {
  // List all crop files in the Entries folder
  const response = await gapi.client.drive.files.list({
    q: `'${entriesFolderId}' in parents and mimeType='application/json' and trashed=false`,
    spaces: "drive",
    fields: "files(id, name)",
    pageSize: 1000,
  });

  const files = response.result.files || [];

  for (const file of files) {
    try {
      const content = await getFileContent(file.id);
      if (!Array.isArray(content)) continue;

      const entryIdx = content.findIndex(e => e.id === entryId);
      if (entryIdx < 0) continue;

      // Found — remove and resave (or delete file if now empty)
      content.splice(entryIdx, 1);
      if (content.length === 0) {
        const token = getAccessToken();
        if (token) {
          await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      } else {
        await upsertJsonFileInFolder(file.name, entriesFolderId, content);
      }
      return true;
    } catch (error) {
      console.error(`Error processing entries file ${file.name}:`, error);
    }
  }

  return false;
}

// Save item data to Google Drive as JSON file
async function saveItemToGoogleDrive(category, item) {
  try {
    // Entries are stored per-crop: {cropId}.json contains an array of all entries for that crop
    if (category === "Entries") {
      return await saveEntryToDrive(item);
    }

    const parentFolderId = driveState.categoryFolderIds[category.toLowerCase()];
    if (!parentFolderId) {
      throw new Error(`Folder ID not found for category: ${category}`);
    }

    // Check if consolidated file exists
    const consolidatedFile = await findFile("_consolidated.json", parentFolderId);
    if (consolidatedFile) {
      const content = await getFileContent(consolidatedFile.id);
      const items = Array.isArray(content) ? content : [];
      const idx = items.findIndex((i) => i.id === item.id);
      if (idx >= 0) {
        items[idx] = item;
      } else {
        items.push(item);
      }
      await upsertJsonFileInFolder("_consolidated.json", parentFolderId, items, consolidatedFile);
      return true;
    }

    const fileName = `${item.id}.json`;
    const fileContent = JSON.stringify(item, null, 2);

    // Check if file already exists
    const existingFile = await findFile(fileName, parentFolderId);

    const boundary = "===============7330845974216740156==";
    const mimeType = "application/json";

    if (existingFile) {
      // Update existing file
      const body =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify({ name: fileName }) +
        "\r\n" +
        `--${boundary}\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n` +
        fileContent +
        "\r\n" +
        `--${boundary}--`;

      const xhr = new XMLHttpRequest();
      xhr.open(
        "PATCH",
        `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`,
        true,
      );
      xhr.setRequestHeader("Authorization", `Bearer ${getAccessToken()}`);
      xhr.setRequestHeader(
        "Content-Type",
        `multipart/related; boundary="${boundary}"`,
      );

      await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else
            reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(body);
      });
    } else {
      // Create new file
      const body =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify({ name: fileName, parents: [parentFolderId] }) +
        "\r\n" +
        `--${boundary}\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n` +
        fileContent +
        "\r\n" +
        `--${boundary}--`;

      const xhr = new XMLHttpRequest();
      xhr.open(
        "POST",
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        true,
      );
      xhr.setRequestHeader("Authorization", `Bearer ${getAccessToken()}`);
      xhr.setRequestHeader(
        "Content-Type",
        `multipart/related; boundary="${boundary}"`,
      );

      await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else
            reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(body);
      });
    }

    return true;
  } catch (error) {
    handleDriveAuthError(error, "Google Drive session expired while saving data");
    console.error(`Error saving item to Google Drive:`, error);
    throw error;
  }
}

// Save multiple items to Google Drive (bulk)
async function saveItemsToGoogleDrive(category, items) {
  try {
    if (!Array.isArray(items)) {
      return saveItemToGoogleDrive(category, items);
    }

    // Entries are stored per-crop: group by cropId and write one file per crop
    if (category === "Entries") {
      return await saveAllEntriesToDrive(items);
    }

    const parentFolderId = driveState.categoryFolderIds[category.toLowerCase()];
    if (parentFolderId) {
      const consolidatedFile = await findFile("_consolidated.json", parentFolderId);
      if (consolidatedFile) {
        const content = await getFileContent(consolidatedFile.id);
        const existing = Array.isArray(content) ? content : [];
        const merged = [...existing];
        for (const item of items) {
          const idx = merged.findIndex((i) => i.id === item.id);
          if (idx >= 0) merged[idx] = item;
          else merged.push(item);
        }
        await upsertJsonFileInFolder("_consolidated.json", parentFolderId, merged, consolidatedFile);
        return true;
      }
    }

    // Save each item sequentially
    for (const item of items) {
      await saveItemToGoogleDrive(category, item);
    }
    return true;
  } catch (error) {
    handleDriveAuthError(error, "Google Drive session expired while saving data");
    console.error(`Error saving items to Google Drive:`, error);
    throw error;
  }
}

// Find file by name in a folder
async function findFile(fileName, parentFolderId) {
  try {
    let query = `name='${fileName}' and mimeType='application/json' and trashed=false`;

    if (parentFolderId) {
      query += ` and '${parentFolderId}' in parents`;
    }

    const response = await gapi.client.drive.files.list({
      q: query,
      spaces: "drive",
      fields: "files(id, name)",
      pageSize: 10,
    });

    const files = response.result.files || [];
    return files.length > 0 ? files[0] : null;
  } catch (error) {
    handleDriveAuthError(error, `Google Drive session expired while finding ${fileName}`);
    console.error(`Error finding file ${fileName}:`, error);
    throw error;
  }
}

// Load all items for a category from Google Drive
async function loadItemsFromGoogleDrive(category) {
  try {
    const parentFolderId = driveState.categoryFolderIds[category.toLowerCase()];
    const response = await gapi.client.drive.files.list({
      q: `'${parentFolderId}' in parents and mimeType='application/json' and trashed=false`,
      spaces: "drive",
      fields: "files(id, name)",
      pageSize: 1000,
    });

    const files = response.result.files || [];
    const items = [];

    // Entries: each file is {cropId}.json containing an array — flatten all
    if (category === "Entries") {
      for (const file of files) {
        try {
          const content = await getFileContent(file.id);
          if (Array.isArray(content)) {
            items.push(...content);
          }
        } catch (error) {
          console.error(`Error loading entries file ${file.name}:`, error);
        }
      }
      return items;
    }

    // Check for consolidated file
    const consolidatedFile = files.find((f) => f.name === "_consolidated.json");
    if (consolidatedFile) {
      try {
        const content = await getFileContent(consolidatedFile.id);
        if (Array.isArray(content)) return content;
      } catch (error) {
        console.error("Error loading consolidated file:", error);
      }
    }

    for (const file of files) {
      if (file.name === "_consolidated.json") continue;
      try {
        const content = await getFileContent(file.id);
        items.push(content);
      } catch (error) {
        console.error(`Error loading file ${file.name}:`, error);
      }
    }

    return items;
  } catch (error) {
    handleDriveAuthError(error, "Google Drive session expired while loading data");
    console.error(`Error loading items from Google Drive:`, error);
    throw error;
  }
}

// Get file content from Google Drive
async function getFileContent(fileId) {
  try {
    const token = getAccessToken();
    if (!token) {
      throw new Error("No access token available");
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch file: ${response.status} ${response.statusText}`,
      );
    }

    return await response.json();
  } catch (error) {
    handleDriveAuthError(error, "Google Drive session expired while fetching file content");
    console.error(`Error getting file content:`, error);
    throw error;
  }
}

// Delete item from Google Drive
async function deleteItemFromGoogleDrive(category, itemId) {
  try {
    const parentFolderId = driveState.categoryFolderIds[category.toLowerCase()];

    if (!parentFolderId) {
      throw new Error(`Folder ID not found for category: ${category}`);
    }

    // Entries: search all crop files for this entry and remove it
    if (category === "Entries") {
      return await deleteEntryFromDrive(itemId, parentFolderId);
    }

    // Check if consolidated file exists
    const consolidatedFile = await findFile("_consolidated.json", parentFolderId);
    if (consolidatedFile) {
      const content = await getFileContent(consolidatedFile.id);
      const items = Array.isArray(content) ? content : [];
      const filtered = items.filter((i) => i.id !== itemId);
      if (filtered.length !== items.length) {
        await upsertJsonFileInFolder("_consolidated.json", parentFolderId, filtered, consolidatedFile);
      }
      return true;
    }

    const fileName = `${itemId}.json`;
    const existingFile = await findFile(fileName, parentFolderId);

    if (existingFile) {
      const token = getAccessToken();
      if (!token) {
        throw new Error("No access token available");
      }

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${existingFile.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok && response.status !== 204) {
        throw new Error(
          `Failed to delete file: ${response.status} ${response.statusText}`,
        );
      }

      return true;
    }

    return false;
  } catch (error) {
    handleDriveAuthError(error, "Google Drive session expired while deleting data");
    console.error(`Error deleting item from Google Drive:`, error);
    throw error;
  }
}

// Get count of items in a category
async function getItemCount(category) {
  try {
    const parentFolderId = driveState.categoryFolderIds[category.toLowerCase()];
    const response = await gapi.client.drive.files.list({
      q: `'${parentFolderId}' in parents and mimeType='application/json' and trashed=false`,
      spaces: "drive",
      fields: "files(id)",
      pageSize: 1000,
    });

    const files = response.result.files || [];
    return files.length;
  } catch (error) {
    handleDriveAuthError(error, "Google Drive session expired while reading item count");
    console.error(`Error getting item count:`, error);
    return 0;
  }
}
