export interface PathAutocompleteRequest {
  path: string;
}

export interface AutocompleteDirectoryEntry {
  name: string;
}

export interface PathAutocompleteResponse {
  directories: AutocompleteDirectoryEntry[];
}
