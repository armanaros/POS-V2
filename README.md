# Restaurant POS System V2

A comprehensive Point of Sale system for restaurants with employee management, built with React.js frontend and Node.js/Express backend.

## Features

### Admin Interface
- **Employee Management**: Create, update, and manage employee accounts
- **Menu Management**: Add, edit, and organize menu categories and items
- **Order Tracking**: Monitor all orders in real-time
- **Reports & Analytics**: Daily sales, employee performance, menu item analysis
- **Real-time Dashboard**: Live updates on orders and sales

### Employee Interface
- **Order Processing**: Create and manage customer orders
- **Menu Display**: Browse available menu items by category
- **Payment Processing**: Handle cash, card, and mobile payments
- **Order Status Updates**: Update order status (pending → preparing → ready → served)

### Technical Features
- **Role-based Authentication**: Separate admin and employee access levels
- **Real-time Updates**: Socket.io integration for live order updates
- **Database**: SQLite for data persistence
- **Security**: JWT authentication, bcrypt password hashing, rate limiting
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## Tech Stack

- **Frontend**: React.js, Material-UI, Socket.io-client
- **Backend**: Node.js, Express.js, Socket.io
- **Database**: SQLite3
- **Authentication**: JWT, bcryptjs
- **Other**: Axios, React Router, Recharts for analytics

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Clone and navigate to the project directory**
   ```bash
   cd c:\Users\Alexandre\Desktop\POS-V2
   ```

2. **Install backend dependencies**
   ```bash
   npm install
   ```

3. **Install frontend dependencies**
   ```bash
   cd client
   npm install
   cd ..
   ```

4. **Environment Setup**
   - Copy `.env` file and update with your settings
   - Default JWT secret is provided (change in production)

5. **Start the development servers**
   ```bash
   # Start both frontend and backend
   npm run dev
   
   # Or start them separately:
   # Backend only
   npm run server
   
   # Frontend only (in another terminal)
   npm run client
   ```

### Default Login Credentials

**Admin Account:**
- Username: `admin`
- Password: `admin123`

### Database

The application uses SQLite database which will be automatically created on first run with:
- Default admin user
- Sample menu categories and items
- Required database schema

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/verify` - Verify JWT token
- `POST /api/auth/logout` - User logout

### Users (Employee Management)
- `GET /api/users` - Get all users (Admin only)
- `POST /api/users` - Create new user (Admin only)
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (Admin only)

### Menu Management
- `GET /api/menu/full` - Get complete menu
- `GET /api/menu/categories` - Get menu categories
- `POST /api/menu/categories` - Create category (Admin only)
- `POST /api/menu/items` - Create menu item (Admin only)
- `PUT /api/menu/items/:id` - Update menu item (Admin only)
- `PATCH /api/menu/items/:id/availability` - Toggle availability

### Orders
- `GET /api/orders` - Get orders
- `POST /api/orders` - Create new order
- `GET /api/orders/:id` - Get order details
- `PATCH /api/orders/:id/status` - Update order status
- `GET /api/orders/active/all` - Get active orders

### Reports
- `GET /api/reports/dashboard` - Dashboard summary
- `GET /api/reports/sales/daily` - Daily sales report
- `GET /api/reports/employees/performance` - Employee performance (Admin only)
- `GET /api/reports/menu/performance` - Menu item performance

## Project Structure

```
restaurant-pos-v2/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── pages/         # Page components
│   │   ├── context/       # React context
│   │   ├── hooks/         # Custom hooks
│   │   └── utils/         # Utilities
├── config/                # Backend configuration
│   └── database.js        # Database setup
├── middleware/            # Express middleware
│   └── auth.js           # Authentication middleware
├── routes/               # API routes
│   ├── auth.js
│   ├── users.js
│   ├── menu.js
│   ├── orders.js
│   └── reports.js
├── database/             # SQLite database files
├── .env                  # Environment variables
├── server.js             # Express server entry point
└── package.json          # Backend dependencies
```

## Development

### Adding New Features
1. Backend: Add routes in `/routes` directory
2. Frontend: Add components in `/client/src/components` or pages in `/client/src/pages`
3. Update API calls in frontend service files

### Database Schema
The application automatically creates the following tables:
- `users` - Employee and admin accounts
- `menu_categories` - Menu organization
- `menu_items` - Individual menu items
- `orders` - Customer orders
- `order_items` - Items within each order
- `shifts` - Employee work shifts
- `activity_logs` - System activity tracking

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting on API endpoints
- CORS configuration
- Input validation
- Role-based access control

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support and questions, please create an issue in the repository.

## Operations (Financial Tracking)

An "Operations" page was added to the frontend for tracking investments, expenses, and income, and for getting suggestions to improve revenue and recoup investment.

Files of interest:
- `client/src/pages/Operations.js` - UI for adding transactions, goals, chart and suggestions
- `client/src/services/operationsAPI.js` - client API wrapper (uses server `/api/operations` and falls back to localStorage)
- `routes/operations.js` - server endpoints and AI proxy for suggestions

Usage:
- Start the server and client: `npm run dev`
- Open the app and navigate to `Operations` in the sidebar
- Add `Investment`, `Expense`, and `Income` items. Entries are saved locally and also to server SQLite if the server is running.
- Use the suggestions area to request AI suggestions. If OpenAI is not configured, heuristic suggestions are returned.

Enable AI suggestions (optional):
- Set `OPENAI_API_KEY` in your server environment (for example in a `.env` file) and restart the server.
- The server will proxy requests to OpenAI for more tailored suggestions. Keep your API key secret.

