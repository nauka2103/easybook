# EasyBooking API 

A backend API for a hotel booking system migrated from SQLite to **MongoDB (Native Driver)**. This project implements full CRUD operations, advanced filtering, and a clean project structure.

## 👥 Team Members & Roles

### **1. Student A (The Architect)**
* **Responsibilities:**
    * MongoDB connection setup (`database/db.js`).
    * Server initialization and Global Middleware (Logging).
    * **Data Seeding:** Automatically populates the database if empty.
    * **Read Operation:** `GET /api/hotels/:id`.

### **2. Student B (The Operator)**
* **Responsibilities:**
    * **Create:** `POST /api/hotels` with input validation.
    * **Update:** `PUT /api/hotels/:id`.
    * **Delete:** `DELETE /api/hotels/:id`.
    * Status code management (201 Created, 400 Bad Request, 404 Not Found).

### **3. Student A and B (The Optimizer)**
* **Responsibilities:**
    * **Advanced Read:** `GET /api/hotels` with:
        * *Filtering* (by City, Min Price, Max Price).
        * *Sorting* (Price Asc/Desc, Name).
        * *Projection* (Field selection).
    * **Frontend Integration:** Updated legacy HTML views to utilize MongoDB data.

---

## 🚀 Setup & Run

1.  **Prerequisites:**
    * Node.js installed.
    * MongoDB installed locally (running on `27017`) OR a MongoDB Atlas URI.

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Start the Server:**
    ```bash
    npm start
    ```
    * The server will run on `http://localhost:3000`.
    * *Note:* On the first run, the database will auto-seed with initial hotel data.

---

## 📡 API Documentation

### **1. Get All Hotels (Filter, Sort, Project)**
* **Endpoint:** `GET /api/hotels`
* **Query Parameters:**
    * `city`: Filter by city (e.g., `?city=Almaty`).
    * `minPrice` / `maxPrice`: Price range filter.
    * `sort`: `price_asc`, `price_desc`, `name_asc`.
    * `fields`: Comma-separated fields to return (e.g., `?fields=title,price_per_night`).
* **Response:** `200 OK` - Array of objects.

### **2. Get Single Hotel**
* **Endpoint:** `GET /api/hotels/:id`
* **Response:** `200 OK` (Object) or `404 Not Found`.

### **3. Create Hotel**
* **Endpoint:** `POST /api/hotels`
* **Body (JSON):**
    ```json
    {
      "title": "Grand Hotel",
      "description": "5-star experience...",
      "location": "Astana",
      "price_per_night": 45000
    }
    ```
* **Response:** `201 Created`.

### **4. Update Hotel**
* **Endpoint:** `PUT /api/hotels/:id`
* **Body (JSON):** Any field to update.
    ```json
    { "price_per_night": 50000 }
    ```
* **Response:** `200 OK`.

### **5. Delete Hotel**
* **Endpoint:** `DELETE /api/hotels/:id`
* **Response:** `200 OK`.

---

## 🧪 Testing

1.  **Browser:** Go to `http://localhost:3000`.
2.  **Test Links:** Use the "API Test Links" section on the Home Page to test Read operations.
3.  **Postman:** Use Postman to test `POST`, `PUT`, and `DELETE` endpoints.
