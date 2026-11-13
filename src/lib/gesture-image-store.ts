const DATABASE_NAME = 'skeleton-vision-gesture-images';
const STORE_NAME = 'images';

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('เปิดที่เก็บรูปไม่สำเร็จ'));
  });
}

export async function loadGestureImages() {
  const database = await openDatabase();
  try {
    return await new Promise<Record<string, Blob>>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const keysRequest = store.getAllKeys();
      const imagesRequest = store.getAll();
      transaction.oncomplete = () => {
        const images: Record<string, Blob> = {};
        keysRequest.result.forEach((key, index) => {
          const image = imagesRequest.result[index];
          if (image instanceof Blob) images[String(key)] = image;
        });
        resolve(images);
      };
      transaction.onerror = () => reject(transaction.error ?? new Error('อ่านรูปไม่สำเร็จ'));
    });
  } finally {
    database.close();
  }
}

export async function saveGestureImage(gesture: string, image: Blob) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(image, gesture);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('บันทึกรูปไม่สำเร็จ'));
    });
  } finally {
    database.close();
  }
}

export async function deleteGestureImage(gesture: string) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(gesture);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('ลบรูปไม่สำเร็จ'));
    });
  } finally {
    database.close();
  }
}
