// server.ts
import express from "express";
import path3 from "path";
import fs3 from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

// src/db/db_adapter.ts
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
var LOCAL_DB_DIR = path.resolve(process.cwd(), "data");
var LOCAL_DB_PATH = path.join(LOCAL_DB_DIR, "premji_store.json");
var mysqlPool = null;
var useLocalDb = true;
var attendanceTableHasCenterCode = false;
function toMysqlDatetime(timeVal, dateStr) {
  if (!timeVal) return null;
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(timeVal)) {
    return timeVal;
  }
  if (timeVal.includes("T")) {
    const d = new Date(timeVal);
    if (!isNaN(d.getTime())) {
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
  }
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(timeVal)) {
    const parts = timeVal.split(":");
    const hh = parts[0].padStart(2, "0");
    const mm = parts[1].padStart(2, "0");
    const ss = (parts[2] || "00").padStart(2, "0");
    return `${dateStr} ${hh}:${mm}:${ss}`;
  }
  if (timeVal.includes(" ")) {
    return timeVal;
  }
  return `${dateStr} ${timeVal}`;
}
var hasMySqlConfig = () => {
  return !!(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE);
};
async function initDatabase() {
  if (hasMySqlConfig()) {
    try {
      console.log("\u{1F504} Attempting connection to Production MySQL Database...");
      mysqlPool = mysql.createPool({
        host: process.env.MYSQL_HOST,
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        waitForConnections: true,
        connectionLimit: 15,
        maxIdle: 10,
        idleTimeout: 6e4,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 1e4,
        dateStrings: true
      });
      const conn = await mysqlPool.getConnection();
      console.log("\u2705 Connected to Production MySQL Database successfully!");
      try {
        const [cols] = await conn.execute("DESCRIBE preamji_attendance");
        attendanceTableHasCenterCode = cols.some((c) => c.Field === "center_code");
      } catch (colErr) {
        attendanceTableHasCenterCode = false;
      }
      conn.release();
      useLocalDb = false;
      return;
    } catch (error) {
      console.error("\u274C Failed to connect to Production MySQL. Falling back to Local Database.", error);
      useLocalDb = true;
    }
  } else {
    console.log("\u2139\uFE0F No MySQL config found. Using Local JSON Database.");
    useLocalDb = true;
  }
  if (!fs.existsSync(LOCAL_DB_DIR)) {
    fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    console.log("\u{1F331} Seeding local database JSON file...");
    const seedData = getSeedData();
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(seedData, null, 2), "utf-8");
  }
}
function getSeedData() {
  return {
    employee_details: [
      {
        id: 1,
        employee_code: "SUPER01",
        employee_name: "Super Administrator",
        password: "super123",
        // Clean fallback passwords for sandbox
        user_role: "Super Admin",
        center_code: "HQ01",
        center_name: "Premji Headquarters",
        mobile_no: "+919999999999",
        email: "superadmin@premji.com",
        employee_status: "Active",
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      {
        id: 2,
        employee_code: "ADMIN01",
        employee_name: "Admin Manager",
        password: "admin123",
        user_role: "Admin",
        center_code: "C01",
        center_name: "Premji Chennai South",
        mobile_no: "+919876543210",
        email: "admin@premji.com",
        employee_status: "Active",
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      {
        id: 3,
        employee_code: "TL01",
        employee_name: "Karthik Raja",
        password: "tl123",
        user_role: "TeamLeader",
        center_code: "C01",
        center_name: "Premji Chennai South",
        mobile_no: "+919123456789",
        email: "karthik@premji.com",
        employee_status: "Active",
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      {
        id: 4,
        employee_code: "TECH01",
        employee_name: "Suresh Kumar",
        password: "tech123",
        user_role: "Technician",
        center_code: "C01",
        center_name: "Premji Chennai South",
        mobile_no: "+919812345670",
        email: "suresh@premji.com",
        employee_status: "Active",
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      {
        id: 5,
        employee_code: "TECH02",
        employee_name: "Ramesh Patel",
        password: "tech123",
        user_role: "Technician",
        center_code: "C02",
        center_name: "Premji Chennai West",
        mobile_no: "+919812345671",
        email: "ramesh@premji.com",
        employee_status: "Active",
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }
    ],
    preamji_attendance: [
      {
        id: 1,
        emp_code_of_thetechnician: "TECH01",
        name_of_technician: "Suresh Kumar",
        center_code: "C01",
        center_name: "Premji Chennai South",
        attendance_date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        on_duty_in_time: "09:15:00",
        on_duty_in_image: "/api/media/view?path=attendance/seed_in.webp",
        intermidiate_off_out_time: "13:00:00",
        intermidiate_off_out_image: "/api/media/view?path=attendance/seed_out.webp",
        intermidiate_off_in_time: "14:00:00",
        intermidiate_off_in_image: "/api/media/view?path=attendance/seed_in2.webp",
        on_duty_out_time: null,
        on_duty_out_image: null,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }
    ],
    workorder_entry: [
      {
        id: 1,
        jobcard_no: "JC-2026-0001",
        jobcard_type: "General Service",
        jobcard_date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        center_code: "C01",
        center_name: "Premji Chennai South",
        technician_code: "TECH01",
        technician_name: "Suresh Kumar",
        team_leader_code: "TL01",
        team_leader_name: "Karthik Raja",
        Vehicle_Manufacturer: "Maruti Suzuki",
        Vehicle_Model: "Swift LXI",
        vehicle_reg_no: "TN-01-AB-1234",
        customer_name: "Anand Gopal",
        customer_mobile: "+919000001111",
        jobcard_photo: "/api/media/view?path=workorders/seed_jobcard.webp",
        status: "Work In Progress",
        estimated_delivery: new Date(Date.now() + 864e5).toISOString().replace("T", " ").substring(0, 19),
        remarks: "Engine oil replacement, water wash requested, brake pads check.",
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      {
        id: 2,
        jobcard_no: "JC-2026-0002",
        jobcard_type: "Body Repair & Painting",
        jobcard_date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        center_code: "C01",
        center_name: "Premji Chennai South",
        technician_code: null,
        technician_name: null,
        team_leader_code: "TL01",
        team_leader_name: "Karthik Raja",
        Vehicle_Manufacturer: "Hyundai",
        Vehicle_Model: "Creta 1.5 S+",
        vehicle_reg_no: "TN-02-CD-5678",
        customer_name: "Sanjay Reddy",
        customer_mobile: "+919111112222",
        jobcard_photo: null,
        status: "Allocated",
        estimated_delivery: new Date(Date.now() + 1728e5).toISOString().replace("T", " ").substring(0, 19),
        remarks: "Right side bumper dent removal & painting.",
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }
    ],
    center_details: [
      {
        id: 1,
        center_code: "C01",
        center_name: "Premji Chennai South",
        center_location: "Guindy, Chennai, Tamil Nadu",
        center_type: "Workshop",
        status: "Active",
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      {
        id: 2,
        center_code: "C02",
        center_name: "Premji Chennai West",
        center_location: "Ambattur, Chennai, Tamil Nadu",
        center_type: "Workshop",
        status: "Active",
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      {
        id: 3,
        center_code: "C03",
        center_name: "Premji Chennai North",
        center_location: "Madhavaram, Chennai, Tamil Nadu",
        center_type: "Workshop",
        status: "Active",
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      }
    ],
    vehicle_model: [
      { id: 1, Vehicle_Manufacturer: "Maruti Suzuki", Vehicle_Model: "Swift" },
      { id: 2, Vehicle_Manufacturer: "Maruti Suzuki", Vehicle_Model: "Baleno" },
      { id: 3, Vehicle_Manufacturer: "Maruti Suzuki", Vehicle_Model: "Brezza" },
      { id: 4, Vehicle_Manufacturer: "Hyundai", Vehicle_Model: "i20" },
      { id: 5, Vehicle_Manufacturer: "Hyundai", Vehicle_Model: "Creta" },
      { id: 6, Vehicle_Manufacturer: "Hyundai", Vehicle_Model: "Verna" },
      { id: 7, Vehicle_Manufacturer: "Tata", Vehicle_Model: "Nexon" },
      { id: 8, Vehicle_Manufacturer: "Tata", Vehicle_Model: "Punch" },
      { id: 9, Vehicle_Manufacturer: "Tata", Vehicle_Model: "Harrier" },
      { id: 10, Vehicle_Manufacturer: "Mahindra", Vehicle_Model: "Thar" },
      { id: 11, Vehicle_Manufacturer: "Mahindra", Vehicle_Model: "XUV700" },
      { id: 12, Vehicle_Manufacturer: "Mahindra", Vehicle_Model: "Scorpio" }
    ]
  };
}
function readLocalDb() {
  try {
    const data = fs.readFileSync(LOCAL_DB_PATH, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading local db, returning seeds", err);
    return getSeedData();
  }
}
function writeLocalDb(data) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing local db", err);
  }
}
var db = {
  // 1. Employee Auth & Details
  async getEmployeeByCode(code) {
    if (!useLocalDb && mysqlPool) {
      const [rows] = await mysqlPool.execute(
        'SELECT * FROM employee_details WHERE employee_code = ? AND employee_status IN ("Active", "1") LIMIT 1',
        [code]
      );
      return rows[0] || null;
    } else {
      const store = readLocalDb();
      const emp = store.employee_details.find(
        (e) => e.employee_code.toUpperCase() === code.toUpperCase() && (e.employee_status === "Active" || e.employee_status === "1")
      );
      return emp || null;
    }
  },
  async getAllEmployees() {
    if (!useLocalDb && mysqlPool) {
      const [rows] = await mysqlPool.execute("SELECT * FROM employee_details ORDER BY id DESC");
      return rows;
    } else {
      const store = readLocalDb();
      return store.employee_details;
    }
  },
  async createEmployee(employee) {
    if (!useLocalDb && mysqlPool) {
      const [result] = await mysqlPool.execute(
        `INSERT INTO employee_details 
        (employee_code, employee_name, password, user_role, center_code, center_name, mobile_no, email, employee_status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          employee.employee_code,
          employee.employee_name,
          employee.password || "123456",
          employee.user_role || "Technician",
          employee.center_code || null,
          employee.center_name || null,
          employee.mobile_no || null,
          employee.email || null,
          employee.employee_status || "Active"
        ]
      );
      return result.insertId;
    } else {
      const store = readLocalDb();
      const newId = store.employee_details.length > 0 ? Math.max(...store.employee_details.map((e) => e.id)) + 1 : 1;
      const newEmp = {
        id: newId,
        employee_code: employee.employee_code,
        employee_name: employee.employee_name,
        password: employee.password || "123456",
        user_role: employee.user_role,
        center_code: employee.center_code || null,
        center_name: employee.center_name || null,
        mobile_no: employee.mobile_no || null,
        email: employee.email || null,
        employee_status: employee.employee_status || "Active",
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      store.employee_details.push(newEmp);
      writeLocalDb(store);
      return newId;
    }
  },
  async updateEmployee(id, employee) {
    if (!useLocalDb && mysqlPool) {
      const fields = [];
      const values = [];
      Object.entries(employee).forEach(([key, val]) => {
        if (key !== "id" && key !== "created_at" && key !== "updated_at") {
          fields.push(`${key} = ?`);
          values.push(val);
        }
      });
      values.push(id);
      const [result] = await mysqlPool.execute(
        `UPDATE employee_details SET ${fields.join(", ")} WHERE id = ?`,
        values
      );
      return result.affectedRows > 0;
    } else {
      const store = readLocalDb();
      const index = store.employee_details.findIndex((e) => e.id === id);
      if (index === -1) return false;
      store.employee_details[index] = {
        ...store.employee_details[index],
        ...employee,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      writeLocalDb(store);
      return true;
    }
  },
  // 2. Attendance & Checkpoint operations
  async getTodayAttendance(empCode, dateStr) {
    if (!useLocalDb && mysqlPool) {
      const [rows] = await mysqlPool.execute(
        `SELECT a.*, e.center_code, e.center_name 
         FROM preamji_attendance a 
         LEFT JOIN employee_details e ON a.emp_code_of_thetechnician = e.employee_code 
         WHERE a.emp_code_of_thetechnician = ? AND a.attendance_date = ? LIMIT 1`,
        [empCode, dateStr]
      );
      return rows[0] || null;
    } else {
      const store = readLocalDb();
      const attendance = store.preamji_attendance.find(
        (a) => a.emp_code_of_thetechnician === empCode && a.attendance_date === dateStr
      );
      return attendance || null;
    }
  },
  async markAttendance(attendance) {
    const dateStr = attendance.attendance_date;
    const empCode = attendance.emp_code_of_thetechnician;
    if (!useLocalDb && mysqlPool) {
      const [rows] = await mysqlPool.execute(
        "SELECT id FROM preamji_attendance WHERE emp_code_of_thetechnician = ? AND attendance_date = ? LIMIT 1",
        [empCode, dateStr]
      );
      if (rows.length > 0) {
        const fields = [];
        const values = [];
        const keys = [
          "on_duty_in_time",
          "on_duty_in_image",
          "intermidiate_off_out_time",
          "intermidiate_off_out_image",
          "intermidiate_off_in_time",
          "intermidiate_off_in_image",
          "on_duty_out_time",
          "on_duty_out_image"
        ];
        keys.forEach((key) => {
          if (attendance[key] !== void 0) {
            fields.push(`${key} = ?`);
            let val = attendance[key];
            if (key.endsWith("_time") && val) {
              val = toMysqlDatetime(val, dateStr);
            }
            values.push(val);
          }
        });
        if (fields.length === 0) return true;
        values.push(rows[0].id);
        const [result] = await mysqlPool.execute(
          `UPDATE preamji_attendance SET ${fields.join(", ")} WHERE id = ?`,
          values
        );
        return result.affectedRows > 0;
      } else {
        const onDutyInTime = toMysqlDatetime(attendance.on_duty_in_time, dateStr);
        const intermidiateOffOutTime = toMysqlDatetime(attendance.intermidiate_off_out_time, dateStr);
        const intermidiateOffInTime = toMysqlDatetime(attendance.intermidiate_off_in_time, dateStr);
        const onDutyOutTime = toMysqlDatetime(attendance.on_duty_out_time, dateStr);
        if (attendanceTableHasCenterCode) {
          try {
            const [result2] = await mysqlPool.execute(
              `INSERT INTO preamji_attendance 
              (emp_code_of_thetechnician, name_of_technician, center_code, center_name, attendance_date,
               on_duty_in_time, on_duty_in_image, intermidiate_off_out_time, intermidiate_off_out_image,
               intermidiate_off_in_time, intermidiate_off_in_image, on_duty_out_time, on_duty_out_image)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                empCode,
                attendance.name_of_technician,
                attendance.center_code || null,
                attendance.center_name || null,
                dateStr,
                onDutyInTime,
                attendance.on_duty_in_image || null,
                intermidiateOffOutTime,
                attendance.intermidiate_off_out_image || null,
                intermidiateOffInTime,
                attendance.intermidiate_off_in_image || null,
                onDutyOutTime,
                attendance.on_duty_out_image || null
              ]
            );
            return result2.insertId > 0;
          } catch (e) {
            if (e.code === "ER_BAD_FIELD_ERROR") {
              attendanceTableHasCenterCode = false;
            } else {
              throw e;
            }
          }
        }
        const [result] = await mysqlPool.execute(
          `INSERT INTO preamji_attendance 
          (emp_code_of_thetechnician, name_of_technician, attendance_date,
           on_duty_in_time, on_duty_in_image, intermidiate_off_out_time, intermidiate_off_out_image,
           intermidiate_off_in_time, intermidiate_off_in_image, on_duty_out_time, on_duty_out_image)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            empCode,
            attendance.name_of_technician,
            dateStr,
            onDutyInTime,
            attendance.on_duty_in_image || null,
            intermidiateOffOutTime,
            attendance.intermidiate_off_out_image || null,
            intermidiateOffInTime,
            attendance.intermidiate_off_in_image || null,
            onDutyOutTime,
            attendance.on_duty_out_image || null
          ]
        );
        return result.insertId > 0;
      }
    } else {
      const store = readLocalDb();
      let index = store.preamji_attendance.findIndex(
        (a) => a.emp_code_of_thetechnician === empCode && a.attendance_date === dateStr
      );
      if (index !== -1) {
        store.preamji_attendance[index] = {
          ...store.preamji_attendance[index],
          ...attendance,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        };
      } else {
        const newId = store.preamji_attendance.length > 0 ? Math.max(...store.preamji_attendance.map((a) => a.id)) + 1 : 1;
        const newAtt = {
          id: newId,
          emp_code_of_thetechnician: empCode,
          name_of_technician: attendance.name_of_technician,
          center_code: attendance.center_code || null,
          center_name: attendance.center_name || null,
          attendance_date: dateStr,
          on_duty_in_time: attendance.on_duty_in_time || null,
          on_duty_in_image: attendance.on_duty_in_image || null,
          intermidiate_off_out_time: attendance.intermidiate_off_out_time || null,
          intermidiate_off_out_image: attendance.intermidiate_off_out_image || null,
          intermidiate_off_in_time: attendance.intermidiate_off_in_time || null,
          intermidiate_off_in_image: attendance.intermidiate_off_in_image || null,
          on_duty_out_time: attendance.on_duty_out_time || null,
          on_duty_out_image: attendance.on_duty_out_image || null,
          created_at: (/* @__PURE__ */ new Date()).toISOString(),
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        store.preamji_attendance.push(newAtt);
      }
      writeLocalDb(store);
      return true;
    }
  },
  async getAttendanceHistory(empCode, limit = 30) {
    if (!useLocalDb && mysqlPool) {
      const [rows] = await mysqlPool.execute(
        `SELECT a.*, e.center_code, e.center_name 
         FROM preamji_attendance a 
         LEFT JOIN employee_details e ON a.emp_code_of_thetechnician = e.employee_code 
         WHERE a.emp_code_of_thetechnician = ? ORDER BY a.attendance_date DESC LIMIT ?`,
        [empCode, limit]
      );
      return rows;
    } else {
      const store = readLocalDb();
      return store.preamji_attendance.filter((a) => a.emp_code_of_thetechnician === empCode).sort((a, b) => b.attendance_date.localeCompare(a.attendance_date)).slice(0, limit);
    }
  },
  async getAttendanceAdminReport(filters) {
    if (!useLocalDb && mysqlPool) {
      let query = `SELECT a.*, e.center_code, e.center_name 
                   FROM preamji_attendance a 
                   LEFT JOIN employee_details e ON a.emp_code_of_thetechnician = e.employee_code 
                   WHERE 1=1`;
      const params = [];
      if (filters.startDate) {
        query += " AND a.attendance_date >= ?";
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        query += " AND a.attendance_date <= ?";
        params.push(filters.endDate);
      }
      if (filters.centerCode) {
        query += " AND e.center_code = ?";
        params.push(filters.centerCode);
      }
      if (filters.employeeCode) {
        query += " AND a.emp_code_of_thetechnician = ?";
        params.push(filters.employeeCode);
      }
      query += " ORDER BY a.attendance_date DESC";
      const [rows] = await mysqlPool.execute(query, params);
      return rows;
    } else {
      const store = readLocalDb();
      let records = [...store.preamji_attendance];
      if (filters.startDate) {
        records = records.filter((r) => r.attendance_date >= filters.startDate);
      }
      if (filters.endDate) {
        records = records.filter((r) => r.attendance_date <= filters.endDate);
      }
      if (filters.centerCode) {
        records = records.filter((r) => r.center_code === filters.centerCode);
      }
      if (filters.employeeCode) {
        records = records.filter((r) => r.emp_code_of_thetechnician === filters.employeeCode);
      }
      return records.sort((a, b) => b.attendance_date.localeCompare(a.attendance_date));
    }
  },
  // 3. Work Orders Management
  async getWorkOrders(filters) {
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    if (!useLocalDb && mysqlPool) {
      let query = "SELECT * FROM workorder_entry WHERE 1=1";
      let countQuery = "SELECT COUNT(*) as total FROM workorder_entry WHERE 1=1";
      const params = [];
      const countParams = [];
      if (filters.search) {
        const searchLike = `%${filters.search}%`;
        const searchSql = " AND (jobcard_no LIKE ? OR vehicle_reg_no LIKE ? OR customer_name LIKE ? OR customer_mobile LIKE ?)";
        query += searchSql;
        countQuery += searchSql;
        params.push(searchLike, searchLike, searchLike, searchLike);
        countParams.push(searchLike, searchLike, searchLike, searchLike);
      }
      if (filters.status) {
        query += " AND status = ?";
        countQuery += " AND status = ?";
        params.push(filters.status);
        countParams.push(filters.status);
      }
      if (filters.centerCode) {
        query += " AND center_code = ?";
        countQuery += " AND center_code = ?";
        params.push(filters.centerCode);
        countParams.push(filters.centerCode);
      }
      if (filters.technicianCode) {
        query += " AND technician_code = ?";
        countQuery += " AND technician_code = ?";
        params.push(filters.technicianCode);
        countParams.push(filters.technicianCode);
      }
      if (filters.startDate) {
        query += " AND jobcard_date >= ?";
        countQuery += " AND jobcard_date >= ?";
        params.push(filters.startDate);
        countParams.push(filters.startDate);
      }
      if (filters.endDate) {
        query += " AND jobcard_date <= ?";
        countQuery += " AND jobcard_date <= ?";
        params.push(filters.endDate);
        countParams.push(filters.endDate);
      }
      query += " ORDER BY jobcard_date DESC, id DESC LIMIT ? OFFSET ?";
      params.push(limit, offset);
      const [rows] = await mysqlPool.execute(query, params);
      const [countRows] = await mysqlPool.execute(countQuery, countParams);
      return {
        data: rows,
        total: countRows[0]?.total || 0
      };
    } else {
      const store = readLocalDb();
      let records = [...store.workorder_entry];
      if (filters.search) {
        const search = filters.search.toLowerCase();
        records = records.filter(
          (r) => r.jobcard_no.toLowerCase().includes(search) || r.vehicle_reg_no.toLowerCase().includes(search) || r.customer_name.toLowerCase().includes(search) || r.customer_mobile.toLowerCase().includes(search)
        );
      }
      if (filters.status) {
        records = records.filter((r) => r.status === filters.status);
      }
      if (filters.centerCode) {
        records = records.filter((r) => r.center_code === filters.centerCode);
      }
      if (filters.technicianCode) {
        records = records.filter((r) => r.technician_code === filters.technicianCode);
      }
      if (filters.startDate) {
        records = records.filter((r) => r.jobcard_date >= filters.startDate);
      }
      if (filters.endDate) {
        records = records.filter((r) => r.jobcard_date <= filters.endDate);
      }
      const total = records.length;
      const sortedRecords = records.sort((a, b) => b.jobcard_date.localeCompare(a.jobcard_date) || b.id - a.id).slice(offset, offset + limit);
      return {
        data: sortedRecords,
        total
      };
    }
  },
  async createWorkOrder(order) {
    if (!useLocalDb && mysqlPool) {
      const dateStr = order.jobcard_date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      let jcNo = order.jobcard_no;
      if (!jcNo) {
        const dateCode = dateStr.replace(/-/g, "").substring(2, 6);
        const [countRow] = await mysqlPool.execute(
          "SELECT COUNT(*) as count FROM workorder_entry WHERE jobcard_date = ?",
          [dateStr]
        );
        const seq = String(countRow[0].count + 1).padStart(3, "0");
        jcNo = `JC-${dateCode}-${seq}`;
      }
      await mysqlPool.execute(
        `INSERT INTO workorder_entry 
        (jobcard_no, jobcard_type, jobcard_date, center_code, center_name, 
         technician_code, technician_name, team_leader_code, team_leader_name,
         Vehicle_Manufacturer, Vehicle_Model, vehicle_reg_no, customer_name, customer_mobile, 
         jobcard_photo, status, estimated_delivery, remarks) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          jcNo,
          order.jobcard_type || "General Service",
          dateStr,
          order.center_code || null,
          order.center_name || null,
          order.technician_code || null,
          order.technician_name || null,
          order.team_leader_code || null,
          order.team_leader_name || null,
          order.Vehicle_Manufacturer,
          order.Vehicle_Model,
          order.vehicle_reg_no,
          order.customer_name,
          order.customer_mobile,
          order.jobcard_photo || null,
          order.status || "Allocated",
          order.estimated_delivery || null,
          order.remarks || null
        ]
      );
      return jcNo;
    } else {
      const store = readLocalDb();
      const dateStr = order.jobcard_date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      let jcNo = order.jobcard_no;
      if (!jcNo) {
        const dateCode = dateStr.replace(/-/g, "").substring(2, 6);
        const count = store.workorder_entry.filter((w) => w.jobcard_date === dateStr).length;
        const seq = String(count + 1).padStart(3, "0");
        jcNo = `JC-${dateCode}-${seq}`;
      }
      const newId = store.workorder_entry.length > 0 ? Math.max(...store.workorder_entry.map((w) => w.id)) + 1 : 1;
      const newOrder = {
        id: newId,
        jobcard_no: jcNo,
        jobcard_type: order.jobcard_type || "General Service",
        jobcard_date: dateStr,
        center_code: order.center_code || null,
        center_name: order.center_name || null,
        technician_code: order.technician_code || null,
        technician_name: order.technician_name || null,
        team_leader_code: order.team_leader_code || null,
        team_leader_name: order.team_leader_name || null,
        Vehicle_Manufacturer: order.Vehicle_Manufacturer,
        Vehicle_Model: order.Vehicle_Model,
        vehicle_reg_no: order.vehicle_reg_no,
        customer_name: order.customer_name,
        customer_mobile: order.customer_mobile,
        jobcard_photo: order.jobcard_photo || null,
        status: order.status || "Allocated",
        estimated_delivery: order.estimated_delivery || null,
        remarks: order.remarks || null,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      store.workorder_entry.push(newOrder);
      writeLocalDb(store);
      return jcNo;
    }
  },
  async updateWorkOrder(id, fieldsToUpdate) {
    if (!useLocalDb && mysqlPool) {
      const fields = [];
      const values = [];
      Object.entries(fieldsToUpdate).forEach(([key, val]) => {
        if (key !== "id" && key !== "created_at" && key !== "updated_at") {
          fields.push(`${key} = ?`);
          values.push(val);
        }
      });
      if (fields.length === 0) return true;
      values.push(id);
      const [result] = await mysqlPool.execute(
        `UPDATE workorder_entry SET ${fields.join(", ")} WHERE id = ?`,
        values
      );
      return result.affectedRows > 0;
    } else {
      const store = readLocalDb();
      const index = store.workorder_entry.findIndex((w) => w.id === id);
      if (index === -1) return false;
      store.workorder_entry[index] = {
        ...store.workorder_entry[index],
        ...fieldsToUpdate,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      writeLocalDb(store);
      return true;
    }
  },
  // 4. Center management
  async getAllCenters() {
    if (!useLocalDb && mysqlPool) {
      const [rows] = await mysqlPool.execute('SELECT * FROM center_details WHERE status = "Active"');
      return rows;
    } else {
      const store = readLocalDb();
      return store.center_details.filter((c) => c.status === "Active");
    }
  },
  async createCenter(center) {
    if (!useLocalDb && mysqlPool) {
      await mysqlPool.execute(
        "INSERT INTO center_details (center_code, center_name, center_location, center_type, status) VALUES (?, ?, ?, ?, ?)",
        [
          center.center_code,
          center.center_name,
          center.center_location,
          center.center_type || "Workshop",
          center.status || "Active"
        ]
      );
      return center.center_code;
    } else {
      const store = readLocalDb();
      const newId = store.center_details.length > 0 ? Math.max(...store.center_details.map((c) => c.id)) + 1 : 1;
      const newCenter = {
        id: newId,
        center_code: center.center_code,
        center_name: center.center_name,
        center_location: center.center_location,
        center_type: center.center_type || "Workshop",
        status: center.status || "Active",
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      store.center_details.push(newCenter);
      writeLocalDb(store);
      return center.center_code;
    }
  },
  async updateCenter(centerCode, updates) {
    if (!useLocalDb && mysqlPool) {
      const fields = [];
      const values = [];
      Object.entries(updates).forEach(([key, val]) => {
        if (key !== "id" && key !== "center_code" && key !== "created_at") {
          fields.push(`${key} = ?`);
          values.push(val);
        }
      });
      if (fields.length === 0) return true;
      values.push(centerCode);
      const [result] = await mysqlPool.execute(
        `UPDATE center_details SET ${fields.join(", ")} WHERE center_code = ?`,
        values
      );
      return result.affectedRows > 0;
    } else {
      const store = readLocalDb();
      const index = store.center_details.findIndex((c) => c.center_code === centerCode);
      if (index === -1) return false;
      store.center_details[index] = {
        ...store.center_details[index],
        ...updates
      };
      writeLocalDb(store);
      return true;
    }
  },
  // 5. Vehicle Model details
  async getVehicleModels() {
    if (!useLocalDb && mysqlPool) {
      const [rows] = await mysqlPool.execute("SELECT * FROM vehicle_model");
      return rows;
    } else {
      const store = readLocalDb();
      return store.vehicle_model;
    }
  },
  async getDistinctManufacturers() {
    if (!useLocalDb && mysqlPool) {
      const [rows] = await mysqlPool.execute("SELECT DISTINCT Vehicle_Manufacturer FROM vehicle_model ORDER BY Vehicle_Manufacturer ASC");
      return rows.map((r) => r.Vehicle_Manufacturer);
    } else {
      const store = readLocalDb();
      const manufacturers = Array.from(new Set(store.vehicle_model.map((vm) => vm.Vehicle_Manufacturer)));
      return manufacturers.sort();
    }
  },
  async getModelsForManufacturer(manufacturer) {
    if (!useLocalDb && mysqlPool) {
      const [rows] = await mysqlPool.execute(
        "SELECT Vehicle_Model FROM vehicle_model WHERE Vehicle_Manufacturer = ? ORDER BY Vehicle_Model ASC",
        [manufacturer]
      );
      return rows.map((r) => r.Vehicle_Model);
    } else {
      const store = readLocalDb();
      const models = store.vehicle_model.filter((vm) => vm.Vehicle_Manufacturer === manufacturer).map((vm) => vm.Vehicle_Model);
      return models.sort();
    }
  },
  // 6. 31-Day image retention automated cleanup
  async cleanupOldImages(days = 31) {
    const cutoffDate = /* @__PURE__ */ new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];
    console.log(`\u{1F9F9} Running cleanup of media older than ${days} days (${cutoffStr})...`);
    const deletedFiles = [];
    let count = 0;
    if (!useLocalDb && mysqlPool) {
      const [result] = await mysqlPool.execute(
        `UPDATE preamji_attendance SET 
         on_duty_in_image = NULL,
         intermidiate_off_out_image = NULL,
         intermidiate_off_in_image = NULL,
         on_duty_out_image = NULL
         WHERE attendance_date < ?`,
        [cutoffStr]
      );
      count = result.affectedRows;
    } else {
      const store = readLocalDb();
      store.preamji_attendance.forEach((a) => {
        if (a.attendance_date < cutoffStr) {
          if (a.on_duty_in_image) {
            deletedFiles.push(a.on_duty_in_image);
            a.on_duty_in_image = null;
          }
          if (a.intermidiate_off_out_image) {
            deletedFiles.push(a.intermidiate_off_out_image);
            a.intermidiate_off_out_image = null;
          }
          if (a.intermidiate_off_in_image) {
            deletedFiles.push(a.intermidiate_off_in_image);
            a.intermidiate_off_in_image = null;
          }
          if (a.on_duty_out_image) {
            deletedFiles.push(a.on_duty_out_image);
            a.on_duty_out_image = null;
          }
          count++;
        }
      });
      if (count > 0) {
        writeLocalDb(store);
      }
    }
    return {
      deletedRecords: count,
      deletedFiles
    };
  }
};

// src/db/sftp_adapter.ts
import Client from "ssh2-sftp-client";
import fs2 from "fs";
import path2 from "path";
var SFTP_CONFIG = {
  host: process.env.SFTP_HOST,
  port: Number(process.env.SFTP_PORT || 22),
  username: process.env.SFTP_USER,
  password: process.env.SFTP_PASSWORD
};
var REMOTE_BASE_DIR = process.env.SFTP_REMOTE_BASE || "/var/www/premji";
var LOCAL_UPLOADS_DIR = path2.resolve(process.cwd(), "data", "uploads");
var hasSftpConfig = () => {
  return !!(process.env.SFTP_HOST && process.env.SFTP_USER && (process.env.SFTP_PASSWORD || process.env.SFTP_KEY));
};
if (!fs2.existsSync(LOCAL_UPLOADS_DIR)) {
  fs2.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });
}
var sftpStorage = {
  /**
   * Uploads an image (either as buffer or Base64 WebP)
   * @param relativePath Subdirectory path like "attendance/2026/09"
   * @param fileName File name like "TECH01_on_duty_in.webp"
   * @param base64Data Base64 string of the image
   */
  async uploadImage(relativePath, fileName, base64Data) {
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    const cleanRelativePath = relativePath.replace(/\\/g, "/");
    const displayPath = `${cleanRelativePath}/${fileName}`;
    if (hasSftpConfig()) {
      const sftp = new Client();
      try {
        console.log(`\u{1F680} Uploading ${fileName} to VPS SFTP at ${SFTP_CONFIG.host}...`);
        await sftp.connect(SFTP_CONFIG);
        const targetDir = `${REMOTE_BASE_DIR}/${cleanRelativePath}`.replace(/\/+/g, "/");
        const targetPath = `${targetDir}/${fileName}`.replace(/\/+/g, "/");
        const exists = await sftp.exists(targetDir);
        if (!exists) {
          await sftp.mkdir(targetDir, true);
        }
        await sftp.put(buffer, targetPath);
        console.log(`\u2705 Uploaded successfully to VPS: ${targetPath}`);
        await sftp.end();
        return displayPath;
      } catch (err) {
        console.error("\u274C VPS SFTP upload failed. Saving image locally instead.", err);
      }
    }
    try {
      const targetLocalDir = path2.join(LOCAL_UPLOADS_DIR, cleanRelativePath);
      if (!fs2.existsSync(targetLocalDir)) {
        fs2.mkdirSync(targetLocalDir, { recursive: true });
      }
      const targetLocalPath = path2.join(targetLocalDir, fileName);
      fs2.writeFileSync(targetLocalPath, buffer);
      console.log(`\u{1F4BE} Saved image locally to: ${targetLocalPath}`);
      return displayPath;
    } catch (err) {
      console.error("\u274C Local file save failed:", err);
      throw err;
    }
  },
  /**
   * Read image as buffer from VPS SFTP or Local path
   */
  async getImageBuffer(virtualPath) {
    const cleanPath = virtualPath.replace(/\\/g, "/");
    if (hasSftpConfig()) {
      const sftp = new Client();
      try {
        await sftp.connect(SFTP_CONFIG);
        const remoteFilePath = `${REMOTE_BASE_DIR}/${cleanPath}`.replace(/\/+/g, "/");
        const exists = await sftp.exists(remoteFilePath);
        if (exists) {
          const buffer = await sftp.get(remoteFilePath);
          await sftp.end();
          return buffer;
        }
        await sftp.end();
      } catch (err) {
        console.error("\u274C SFTP getImageBuffer failed, falling back to local search.", err);
      }
    }
    const localFilePath = path2.join(LOCAL_UPLOADS_DIR, cleanPath);
    if (fs2.existsSync(localFilePath)) {
      return fs2.readFileSync(localFilePath);
    }
    if (cleanPath.startsWith("attendance/seed_") || cleanPath.startsWith("workorders/seed_")) {
      return Buffer.from(getPlaceholderSvg(cleanPath.split("/").pop() || "Seed Image"));
    }
    throw new Error(`File not found: ${virtualPath}`);
  },
  /**
   * Delete image file (for cleanup logs)
   */
  async deleteImage(virtualPath) {
    const cleanPath = virtualPath.replace(/\\/g, "/");
    if (hasSftpConfig()) {
      const sftp = new Client();
      try {
        await sftp.connect(SFTP_CONFIG);
        const remoteFilePath = `${REMOTE_BASE_DIR}/${cleanPath}`.replace(/\/+/g, "/");
        const exists = await sftp.exists(remoteFilePath);
        if (exists) {
          await sftp.delete(remoteFilePath);
          await sftp.end();
          return true;
        }
        await sftp.end();
      } catch (err) {
        console.error("\u274C SFTP deleteImage failed.", err);
      }
    }
    const localFilePath = path2.join(LOCAL_UPLOADS_DIR, cleanPath);
    if (fs2.existsSync(localFilePath)) {
      fs2.unlinkSync(localFilePath);
      return true;
    }
    return false;
  }
};
function getPlaceholderSvg(title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
    <rect width="100%" height="100%" fill="#f0f9ff"/>
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#bae6fd"/>
        <stop offset="100%" stop-color="#e0f2fe"/>
      </linearGradient>
    </defs>
    <rect width="380" height="280" x="10" y="10" rx="16" fill="url(#g)" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="6 4"/>
    <circle cx="200" cy="130" r="45" fill="#38bdf8" opacity="0.2"/>
    <path d="M185 130a15 15 0 1 0 30 0 15 15 0 1 0-30 0M170 180c0-15 10-25 30-25s30 10 30 25" stroke="#0284c7" stroke-width="3" stroke-linecap="round" fill="none"/>
    <text x="50%" y="220" font-family="-apple-system, sans-serif" font-size="14" font-weight="600" fill="#0369a1" text-anchor="middle">${title}</text>
    <text x="50%" y="242" font-family="-apple-system, sans-serif" font-size="11" fill="#0284c7" text-anchor="middle">Premji Operations Portal Secured</text>
  </svg>`;
}

// src/db/jwt.ts
import crypto from "crypto";
var JWT_SECRET = process.env.JWT_SECRET || "premji_groups_portal_super_secure_salt_2026";
function base64UrlEncode(str) {
  const base64 = typeof str === "string" ? Buffer.from(str).toString("base64") : str.toString("base64");
  return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf-8");
}
var jwtUtil = {
  sign(payload, expiresInDays = 7) {
    const header = { alg: "HS256", typ: "JWT" };
    const exp = Math.floor(Date.now() / 1e3) + expiresInDays * 24 * 60 * 60;
    const fullPayload = { ...payload, exp };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto.createHmac("sha256", JWT_SECRET).update(signatureInput).digest();
    const encodedSignature = base64UrlEncode(signature);
    return `${signatureInput}.${encodedSignature}`;
  },
  verify(token) {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const [encodedHeader, encodedPayload, encodedSignature] = parts;
      const signatureInput = `${encodedHeader}.${encodedPayload}`;
      const expectedSignature = crypto.createHmac("sha256", JWT_SECRET).update(signatureInput).digest();
      const expectedEncodedSignature = base64UrlEncode(expectedSignature);
      const match = crypto.timingSafeEqual(
        Buffer.from(encodedSignature),
        Buffer.from(expectedEncodedSignature)
      );
      if (!match) return null;
      const payload = JSON.parse(base64UrlDecode(encodedPayload));
      if (payload.exp && Date.now() / 1e3 > payload.exp) {
        return null;
      }
      return payload;
    } catch (err) {
      return null;
    }
  }
};

// server.ts
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path3.dirname(__filename);
async function startServer() {
  console.log("\u{1F3C1} Starting Premji Groups Enterprise Operations Server...");
  await initDatabase();
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  app.use((req, res, next) => {
    const rawCookies = req.headers.cookie || "";
    const cookies = {};
    rawCookies.split(";").forEach((cookie) => {
      const parts = cookie.split("=");
      const name = parts[0]?.trim();
      const val = parts.slice(1).join("=")?.trim();
      if (name) {
        cookies[name] = decodeURIComponent(val);
      }
    });
    req.cookies = cookies;
    next();
  });
  app.use((req, res, next) => {
    const token = req.cookies?.premji_session;
    if (token) {
      const decoded = jwtUtil.verify(token);
      if (decoded) {
        req.user = decoded;
      }
    }
    next();
  });
  const requireAuth = (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    next();
  };
  const requireRole = (allowedRoles) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (!allowedRoles.includes(req.user.user_role)) {
        return res.status(403).json({ error: "Access denied: insufficient permissions" });
      }
      next();
    };
  };
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { employee_code, password } = req.body;
      if (!employee_code || !password) {
        return res.status(400).json({ error: "Employee code and password are required" });
      }
      const emp = await db.getEmployeeByCode(employee_code);
      if (!emp) {
        return res.status(401).json({ error: "Invalid employee code or inactive status" });
      }
      if (emp.password !== password) {
        return res.status(401).json({ error: "Incorrect password" });
      }
      const token = jwtUtil.sign({
        employee_code: emp.employee_code,
        employee_name: emp.employee_name,
        user_role: emp.user_role,
        center_code: emp.center_code,
        center_name: emp.center_name
      });
      res.cookie("premji_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1e3
        // 7 days
      });
      return res.json({
        success: true,
        user: {
          employee_code: emp.employee_code,
          employee_name: emp.employee_name,
          user_role: emp.user_role,
          center_code: emp.center_code,
          center_name: emp.center_name
        }
      });
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ error: "Internal server error during login" });
    }
  });
  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("premji_session");
    return res.json({ success: true, message: "Logged out successfully" });
  });
  app.get("/api/auth/me", requireAuth, (req, res) => {
    return res.json({ user: req.user });
  });
  app.get("/api/attendance/today", requireAuth, async (req, res) => {
    try {
      const empCode = req.query.employee_code || req.user.employee_code;
      if (empCode !== req.user.employee_code && !["TeamLeader", "Admin", "Super Admin"].includes(req.user.user_role)) {
        return res.status(403).json({ error: "Access denied: cannot view other attendance" });
      }
      const istDateStr = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      const att = await db.getTodayAttendance(empCode, istDateStr);
      return res.json({ attendance: att, todayDate: istDateStr });
    } catch (err) {
      console.error("Error fetching today attendance:", err);
      return res.status(500).json({ error: "Failed to retrieve today's attendance status" });
    }
  });
  app.post("/api/attendance/mark", requireAuth, async (req, res) => {
    try {
      const { checkpoint, image, target_employee_code } = req.body;
      if (!checkpoint || !image) {
        return res.status(400).json({ error: "Checkpoint type and image are required" });
      }
      const validCheckpoints = ["on_duty_in", "intermidiate_off_out", "intermidiate_off_in", "on_duty_out"];
      if (!validCheckpoints.includes(checkpoint)) {
        return res.status(400).json({ error: "Invalid checkpoint key" });
      }
      let empCode = req.user.employee_code;
      let empName = req.user.employee_name;
      let centerCode = req.user.center_code;
      let centerName = req.user.center_name;
      if (target_employee_code && target_employee_code !== req.user.employee_code) {
        if (!["TeamLeader", "Admin", "Super Admin"].includes(req.user.user_role)) {
          return res.status(403).json({ error: "Access denied: cannot mark attendance for team" });
        }
        const targetEmp = await db.getEmployeeByCode(target_employee_code);
        if (!targetEmp) {
          return res.status(404).json({ error: "Target employee not found" });
        }
        empCode = targetEmp.employee_code;
        empName = targetEmp.employee_name;
        centerCode = targetEmp.center_code;
        centerName = targetEmp.center_name;
      }
      const nowIST = /* @__PURE__ */ new Date();
      const istTimeStr = nowIST.toLocaleTimeString("en-US", {
        timeZone: "Asia/Kolkata",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      const istDateStr = nowIST.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      const year = nowIST.getFullYear();
      const month = String(nowIST.getMonth() + 1).padStart(2, "0");
      const relativeFolder = `attendance/${year}/${month}`;
      const fileName = `${empCode}_${checkpoint}_${Date.now()}.webp`;
      const savedVirtualPath = await sftpStorage.uploadImage(relativeFolder, fileName, image);
      const attPayload = {
        emp_code_of_thetechnician: empCode,
        name_of_technician: empName,
        center_code: centerCode,
        center_name: centerName,
        attendance_date: istDateStr
      };
      attPayload[`${checkpoint}_time`] = istTimeStr;
      attPayload[`${checkpoint}_image`] = `/api/media/view?path=${savedVirtualPath}`;
      const success = await db.markAttendance(attPayload);
      if (!success) {
        return res.status(500).json({ error: "Failed to write attendance log to database" });
      }
      return res.json({
        success: true,
        message: `Attendance checkpoint '${checkpoint}' logged at ${istTimeStr}`,
        time: istTimeStr,
        date: istDateStr,
        imagePath: attPayload[`${checkpoint}_image`]
      });
    } catch (err) {
      console.error("Error marking attendance:", err);
      return res.status(500).json({ error: "Failed to record attendance" });
    }
  });
  app.get("/api/attendance/history", requireAuth, async (req, res) => {
    try {
      const limit = Number(req.query.limit || 30);
      const history = await db.getAttendanceHistory(req.user.employee_code, limit);
      return res.json({ history });
    } catch (err) {
      console.error("Error fetching history:", err);
      return res.status(500).json({ error: "Failed to fetch attendance history" });
    }
  });
  app.get("/api/attendance/admin-report", requireAuth, requireRole(["Admin", "Super Admin"]), async (req, res) => {
    try {
      const { start_date, end_date, center_code, employee_code } = req.query;
      const records = await db.getAttendanceAdminReport({
        startDate: start_date,
        endDate: end_date,
        centerCode: center_code,
        employeeCode: employee_code
      });
      return res.json({ records });
    } catch (err) {
      console.error("Admin report error:", err);
      return res.status(500).json({ error: "Failed to load master attendance report" });
    }
  });
  app.get("/api/workorders", requireAuth, async (req, res) => {
    try {
      const { search, status, center_code, technician_code, start_date, end_date, limit, offset } = req.query;
      let filterTechCode = technician_code;
      let filterCenterCode = center_code;
      if (req.user.user_role === "Technician") {
        filterTechCode = req.user.employee_code;
      }
      const orders = await db.getWorkOrders({
        search,
        status,
        centerCode: filterCenterCode,
        technicianCode: filterTechCode,
        startDate: start_date,
        endDate: end_date,
        limit: limit ? Number(limit) : 25,
        offset: offset ? Number(offset) : 0
      });
      return res.json(orders);
    } catch (err) {
      console.error("Error retrieving work orders:", err);
      return res.status(500).json({ error: "Failed to retrieve work orders list" });
    }
  });
  app.post("/api/workorders/create", requireAuth, requireRole(["TeamLeader", "Admin", "Super Admin"]), async (req, res) => {
    try {
      const {
        jobcard_type,
        Vehicle_Manufacturer,
        Vehicle_Model,
        vehicle_reg_no,
        customer_name,
        customer_mobile,
        remarks,
        estimated_delivery,
        technician_code,
        jobcard_photo_base64
      } = req.body;
      if (!Vehicle_Manufacturer || !Vehicle_Model || !vehicle_reg_no || !customer_name || !customer_mobile) {
        return res.status(400).json({ error: "Vehicle Details, customer name, and mobile are required." });
      }
      let assignedTechName = null;
      if (technician_code) {
        const tech = await db.getEmployeeByCode(technician_code);
        if (tech) {
          assignedTechName = tech.employee_name;
        }
      }
      let uploadedPhotoUrl = null;
      if (jobcard_photo_base64) {
        const year = (/* @__PURE__ */ new Date()).getFullYear();
        const month = String((/* @__PURE__ */ new Date()).getMonth() + 1).padStart(2, "0");
        const relativeFolder = `workorders/${year}/${month}`;
        const fileName = `JC_PHOTO_${Date.now()}.webp`;
        const path4 = await sftpStorage.uploadImage(relativeFolder, fileName, jobcard_photo_base64);
        uploadedPhotoUrl = `/api/media/view?path=${path4}`;
      }
      const jobcardDate = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      const jcNo = await db.createWorkOrder({
        jobcard_type: jobcard_type || "General Service",
        jobcard_date: jobcardDate,
        center_code: req.user.center_code,
        center_name: req.user.center_name,
        technician_code: technician_code || null,
        technician_name: assignedTechName,
        team_leader_code: req.user.employee_code,
        team_leader_name: req.user.employee_name,
        Vehicle_Manufacturer,
        Vehicle_Model,
        vehicle_reg_no,
        customer_name,
        customer_mobile,
        jobcard_photo: uploadedPhotoUrl,
        status: "Allocated",
        estimated_delivery: estimated_delivery || null,
        remarks: remarks || null
      });
      return res.json({ success: true, message: "Work order created successfully", jobcard_no: jcNo });
    } catch (err) {
      console.error("Work order creation error:", err);
      return res.status(500).json({ error: "Failed to create work order" });
    }
  });
  app.patch("/api/workorders/:id/status", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status, remarks, technician_code } = req.body;
      if (!status) {
        return res.status(400).json({ error: "Status is required" });
      }
      const updates = { status };
      if (remarks !== void 0) {
        updates.remarks = remarks;
      }
      if (technician_code !== void 0) {
        if (technician_code === null || technician_code === "") {
          updates.technician_code = null;
          updates.technician_name = null;
        } else {
          const tech = await db.getEmployeeByCode(technician_code);
          if (tech) {
            updates.technician_code = tech.employee_code;
            updates.technician_name = tech.employee_name;
          } else {
            return res.status(404).json({ error: "Technician code not found" });
          }
        }
      }
      const success = await db.updateWorkOrder(id, updates);
      if (!success) {
        return res.status(404).json({ error: "Work order not found" });
      }
      return res.json({ success: true, message: "Work order status updated successfully" });
    } catch (err) {
      console.error("Update status error:", err);
      return res.status(500).json({ error: "Failed to update work order status" });
    }
  });
  app.get("/api/workorders/lookup", requireAuth, async (req, res) => {
    try {
      const manufacturers = await db.getDistinctManufacturers();
      return res.json({ manufacturers });
    } catch (err) {
      console.error("Lookup error:", err);
      return res.status(500).json({ error: "Failed to fetch manufacturers" });
    }
  });
  app.get("/api/workorders/lookup-models", requireAuth, async (req, res) => {
    try {
      const mfr = req.query.manufacturer;
      if (!mfr) {
        return res.status(400).json({ error: "Manufacturer is required" });
      }
      const models = await db.getModelsForManufacturer(mfr);
      return res.json({ models });
    } catch (err) {
      console.error("Lookup models error:", err);
      return res.status(500).json({ error: "Failed to fetch models" });
    }
  });
  app.get("/api/centers", requireAuth, async (req, res) => {
    try {
      const centers = await db.getAllCenters();
      return res.json({ centers });
    } catch (err) {
      console.error("Centers error:", err);
      return res.status(500).json({ error: "Failed to fetch centers list" });
    }
  });
  app.post("/api/centers", requireAuth, requireRole(["Admin", "Super Admin"]), async (req, res) => {
    try {
      const { center_code, center_name, center_location, center_type } = req.body;
      if (!center_code || !center_name || !center_location) {
        return res.status(400).json({ error: "Code, Name, and Location are required" });
      }
      const code = await db.createCenter({
        center_code,
        center_name,
        center_location,
        center_type: center_type || "Workshop",
        status: "Active"
      });
      return res.json({ success: true, message: "Center created successfully", center_code: code });
    } catch (err) {
      console.error("Center create error:", err);
      return res.status(500).json({ error: "Failed to create center" });
    }
  });
  app.patch("/api/centers/:code", requireAuth, requireRole(["Admin", "Super Admin"]), async (req, res) => {
    try {
      const centerCode = req.params.code;
      const updates = req.body;
      const success = await db.updateCenter(centerCode, updates);
      if (!success) {
        return res.status(404).json({ error: "Workshop center not found" });
      }
      return res.json({ success: true, message: "Center modified successfully" });
    } catch (err) {
      console.error("Center update error:", err);
      return res.status(500).json({ error: "Failed to update center" });
    }
  });
  app.get("/api/employees", requireAuth, requireRole(["TeamLeader", "Admin", "Super Admin"]), async (req, res) => {
    try {
      let employees = await db.getAllEmployees();
      if (req.user.user_role === "TeamLeader") {
        employees = employees.filter((e) => e.center_code === req.user.center_code);
      }
      return res.json({ employees });
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch employee list" });
    }
  });
  app.post("/api/employees", requireAuth, requireRole(["Admin", "Super Admin"]), async (req, res) => {
    try {
      const { employee_code, employee_name, password, user_role, center_code, mobile_no, email } = req.body;
      if (!employee_code || !employee_name || !password || !user_role) {
        return res.status(400).json({ error: "Code, Name, Password, and Role are required" });
      }
      const duplicate = await db.getEmployeeByCode(employee_code);
      if (duplicate) {
        return res.status(400).json({ error: "Employee code already exists" });
      }
      let centerName = null;
      if (center_code) {
        const centers = await db.getAllCenters();
        const ctr = centers.find((c) => c.center_code === center_code);
        if (ctr) centerName = ctr.center_name;
      }
      const id = await db.createEmployee({
        employee_code,
        employee_name,
        password,
        user_role,
        center_code,
        center_name: centerName,
        mobile_no,
        email,
        employee_status: "Active"
      });
      return res.json({ success: true, message: "Employee added successfully", employee_id: id });
    } catch (err) {
      console.error("Employee creation error:", err);
      return res.status(500).json({ error: "Failed to add employee" });
    }
  });
  app.patch("/api/employees/:id", requireAuth, requireRole(["Admin", "Super Admin"]), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const updates = req.body;
      if (req.user.user_role === "Admin") {
        const all = await db.getAllEmployees();
        const target = all.find((e) => e.id === id);
        if (target && ["Admin", "Super Admin"].includes(target.user_role) && target.employee_code !== req.user.employee_code) {
          return res.status(403).json({ error: "Access denied: Admins cannot modify other Admin accounts" });
        }
      }
      if (updates.center_code) {
        const centers = await db.getAllCenters();
        const ctr = centers.find((c) => c.center_code === updates.center_code);
        if (ctr) {
          updates.center_name = ctr.center_name;
        }
      }
      const success = await db.updateEmployee(id, updates);
      if (!success) {
        return res.status(404).json({ error: "Employee not found" });
      }
      return res.json({ success: true, message: "Employee modified successfully" });
    } catch (err) {
      console.error("Update employee error:", err);
      return res.status(500).json({ error: "Failed to update employee" });
    }
  });
  app.get("/api/media/view", async (req, res) => {
    try {
      const filePath = req.query.path;
      if (!filePath) {
        return res.status(400).send("Media path query required");
      }
      if (filePath.includes("..") || filePath.startsWith("/") || filePath.startsWith("\\")) {
        return res.status(403).send("Forbidden media access path");
      }
      const imageBuffer = await sftpStorage.getImageBuffer(filePath);
      let contentType = "image/webp";
      if (filePath.endsWith(".png")) contentType = "image/png";
      else if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) contentType = "image/jpeg";
      else if (filePath.endsWith(".svg")) contentType = "image/svg+xml";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(imageBuffer);
    } catch (err) {
      console.warn(`Media view warning for path: ${req.query.path}`, err);
      return res.status(404).send("Image resource not found");
    }
  });
  app.post("/api/maintenance/cleanup", requireAuth, requireRole(["Admin", "Super Admin"]), async (req, res) => {
    try {
      const days = Number(req.body.days || 31);
      const report = await db.cleanupOldImages(days);
      for (const virtualPath of report.deletedFiles) {
        try {
          await sftpStorage.deleteImage(virtualPath);
        } catch (e) {
          console.error(`Failed to wipe physical image: ${virtualPath}`, e);
        }
      }
      return res.json({
        success: true,
        message: `Wiped attendance database references and logs older than ${days} days.`,
        clearedRecordsCount: report.deletedRecords,
        clearedFilesCount: report.deletedFiles.length
      });
    } catch (err) {
      console.error("Cleanup routine failure:", err);
      return res.status(500).json({ error: "Failed to complete image retention cleanup routine" });
    }
  });
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    console.log("\u26A1 Mounting Vite server middleware in development mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let html = fs3.readFileSync(path3.resolve(__dirname, "index.html"), "utf-8");
        html = await vite.transformIndexHtml(url, html);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    console.log("\u{1F4E6} Serving compiled static bundle in production mode...");
    const distPath = path3.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path3.resolve(distPath, "index.html"));
    });
  }
  const PORT = Number(process.env.PORT || 3e3);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\u{1F680} Premji Enterprise Portal ready at http://localhost:${PORT}`);
  });
}
startServer().catch((e) => {
  console.error("\u{1F534} Critical Server Bootstrap Failure:", e);
});
