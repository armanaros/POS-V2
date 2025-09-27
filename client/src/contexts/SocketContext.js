import React, { createContext, useContext, useState } from 'react';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  // Provide empty/default values since we're using Firebase instead of Socket.io
  const [isConnected] = useState(false);
  const [orders] = useState([]);
  const [menuItems] = useState([]);
  const [users] = useState([]);
  const [notifications] = useState([]);
  // Processing flag to indicate an order is currently being created/processed
  const [isProcessing, setIsProcessing] = useState(false);

  // Empty functions to maintain compatibility with existing components
  const updateLocalOrders = () => {};
  const updateLocalMenuItems = () => {};
  const updateLocalUsers = () => {};
  const emitOrderUpdate = () => {};
  const emitMenuUpdate = () => {};
  const emitUserUpdate = () => {};
  const clearNotifications = () => {};
  const removeNotification = () => {};
  const forceSync = () => {};

  const startProcessing = () => setIsProcessing(true);
  const stopProcessing = () => setIsProcessing(false);

  const value = {
    socket: null,
    isConnected,
    orders,
    menuItems,
    users,
    notifications,
    updateLocalOrders,
    updateLocalMenuItems,
    updateLocalUsers,
    emitOrderUpdate,
    emitMenuUpdate,
    emitUserUpdate,
    clearNotifications,
    removeNotification,
    forceSync,
    // Processing helpers
    isProcessing,
    startProcessing,
    stopProcessing,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketContext;
