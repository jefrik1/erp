import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  productLookup: (query) => ipcRenderer.invoke('product-lookup', query),
  cartAdd: (item) => ipcRenderer.invoke('cart-add', item),
  cartList: () => ipcRenderer.invoke('cart-list'),
  cartClear: () => ipcRenderer.invoke('cart-clear'),
  checkout: (transaction) => ipcRenderer.invoke('checkout', transaction),
  sync: (serverUrl, token) => ipcRenderer.invoke('sync', serverUrl, token)
});
