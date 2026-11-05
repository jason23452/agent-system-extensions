let contracts;
try {
  contracts = await import("../vendor/contracts/index.js");
} catch (error) {
  if (!error || typeof error !== "object" || error.code !== "ERR_MODULE_NOT_FOUND") throw error;
  contracts = await import("../../../contracts/dist/index.js");
}

export const validateExtensionCatalog = contracts.validateExtensionCatalog;
export const validateExtensionRelease = contracts.validateExtensionRelease;
export const checkExtensionHostCompatibility = contracts.checkExtensionHostCompatibility;
