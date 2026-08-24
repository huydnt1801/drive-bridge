export interface DriveConnection {
  id: string;
  name: string;
  email: string;
  folderId: string;
  folderName: string;
  encryptedRefreshToken: string;
  createdAt: string;
}

export type PublicConnection = Omit<DriveConnection, "encryptedRefreshToken"> & {
  status: "connected";
};

export interface DriveMedia {
  id: string;
  connectionId: string;
  connectionName: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime: string;
  modifiedTime: string;
  thumbnailLink?: string;
}

export interface ConnectionError {
  connectionId: string;
  connectionName: string;
  message: string;
}
