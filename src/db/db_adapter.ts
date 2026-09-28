import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

// Define DB Schemas matching production MySQL database
export interface EmployeeDetails {
  id?: number;
  employee_code: string;
  employee_name: string;
  password?: string; // SHA-256 or plain text for easy setup
  user_role: 'Technician' | 'Accounts' | 'Engineer' | 'TeamLeader' | 'Admin' | 'Super Admin';
  center_code: string | null;
  center_name: string | null;
  user_details?: string | null;
  employee_doj?: string | null;
  employee_status: 'Active' | 'Inactive' | '1' | '0';
  created_at?: string | Date;
  updated_at?: string | Date;
}

export interface PremjiAttendance {
  id?: number;
  emp_code_of_thetechnician: string;
  name_of_technician: string;
  center_code: string | null;
  center_name: string | null;
  attendance_date: string; // YYYY-MM-DD
  on_duty_in_time: string | null; // HH:MM:SS
  on_duty_in_image: string | null;
  intermidiate_off_out_time: string | null;
  intermidiate_off_out_image: string | null;
  intermidiate_off_in_time: string | null;
  intermidiate_off_in_image: string | null;
  on_duty_out_time: string | null;
  on_duty_out_image: string | null;
  created_at?: string | Date;
  updated_at?: string | Date;
}

export interface WorkorderEntry {
  id?: number;
  jobcard_type: string;
  technician_code: string | null;
  name_of_technician: string | null;
  jobcard_photo: string | null;
  previous_jobcard_no: string | null;
  vehicle_registration_no: string;
  vehicle_manufacturer: string;
  vehicle_model: string;
  vehicle_variant: string | null;
  jobcard_no: string;
  jobcard_date: string; // YYYY-MM-DD
  job_assign_date: string | null; // YYYY-MM-DD
  kilometres: number | null;
  name_of_service_advisor: string | null;
  center_code: string | null;
  center_name: string | null;
  center_location: string | null;
  job_start_time?: string | null;
  tl_id?: string | null;
  tl_last_update?: string | Date | null;
  tl_remarks?: string | null;
  job_status: string; // 'In Progress' | 'Re-assigned' | 'Closed' | 'New workorder'
  admin_id?: string | null;
  admin_remarks?: string | null;
  admin_last_update_time?: string | Date | null;
  job_compleate_date?: string | null;
  job_compleate_time?: string | null;
  created_at?: string | Date;
  updated_at?: string | Date;
  // 14 Service Counts
  wheel_alignment?: number | null;
  wheel_balancing?: number | null;
  tyre_fitting?: number | null;
  puncture_removed?: number | null;
  tpms_replacement?: number | null;
  disc_cutting?: number | null;
  drum_cutting?: number | null;
  brake_testing?: number | null;
  carbon_cleaning_decarb?: number | null;
  washing_and_cleaning?: number | null;
  interior_cleaning?: number | null;
  exterior_polishing?: number | null;
  paint_protection_film?: number | null;
  wheel_tyre_rotation?: number | null;
  delete_flag?: number;
}

export interface CenterDetails {
  id?: number;
  center_code: string;
  center_name: string;
  center_location: string;
  center_type: string;
  status: 'Active' | 'Inactive';
  created_at?: string | Date;
}

export interface VehicleModel {
  id?: number;
  Vehicle_Manufacturer: string;
  Vehicle_Model: string;
}

// Local JSON File Database path for fallback (use /tmp on serverless environments like Vercel)
const LOCAL_DB_DIR = process.env.VERCEL
  ? path.join('/tmp', 'premji_data')
  : path.resolve(process.cwd(), 'data');
const LOCAL_DB_PATH = path.join(LOCAL_DB_DIR, 'premji_store.json');

// In-memory fallback database to guarantee zero crashes on read-only serverless environments
let memoryDb: any = null;

// MySQL Pool definition (instantiated lazily)
let mysqlPool: any = null;
let useLocalDb = true;
let attendanceTableHasCenterCode = false;

// Helper to format time strings into valid MySQL DATETIME (YYYY-MM-DD HH:MM:SS)
export function toMysqlDatetime(timeVal: string | null | undefined, dateStr: string): string | null {
  if (!timeVal) return null;
  // If it's already full datetime 'YYYY-MM-DD HH:MM:SS'
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(timeVal)) {
    return timeVal;
  }
  // If it's ISO '2026-09-25T22:37:51.000Z'
  if (timeVal.includes('T')) {
    const d = new Date(timeVal);
    if (!isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
  }
  // If it's only time 'HH:MM:SS' or 'HH:MM'
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(timeVal)) {
    const parts = timeVal.split(':');
    const hh = parts[0].padStart(2, '0');
    const mm = parts[1].padStart(2, '0');
    const ss = (parts[2] || '00').padStart(2, '0');
    return `${dateStr} ${hh}:${mm}:${ss}`;
  }
  if (timeVal.includes(' ')) {
    return timeVal;
  }
  return `${dateStr} ${timeVal}`;
}

// Helper to check MySQL configuration
const hasMySqlConfig = () => {
  return !!(
    process.env.MYSQL_HOST &&
    process.env.MYSQL_USER &&
    process.env.MYSQL_DATABASE
  );
};

// Initialize connection pool if configured
export async function initDatabase() {
  if (mysqlPool) {
    return; // Already initialized
  }

  if (hasMySqlConfig()) {
    try {
      console.log('🔄 Attempting connection to Production MySQL Database...');
      mysqlPool = mysql.createPool({
        host: process.env.MYSQL_HOST,
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        waitForConnections: true,
        connectionLimit: 10,
        maxIdle: 5,
        idleTimeout: 30000,
        connectTimeout: 3500, // 3.5s timeout for serverless
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        dateStrings: true,
      });
      // Strict timeout protection so serverless lambdas never hang
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('MySQL connection handshake timeout (3.5s limit reached)')), 3500)
      );
      const conn: any = await Promise.race([mysqlPool.getConnection(), timeoutPromise]);
      console.log('✅ Connected to Production MySQL Database successfully!');
      try {
        const [cols]: any = await conn.execute('DESCRIBE preamji_attendance');
        attendanceTableHasCenterCode = cols.some((c: any) => c.Field === 'center_code');
      } catch (colErr) {
        attendanceTableHasCenterCode = false;
      }
      conn.release();
      useLocalDb = false;
      return;
    } catch (error) {
      console.error('❌ Failed to connect to Production MySQL. Falling back to Local Database.', error);
      mysqlPool = null;
      useLocalDb = true;
    }
  } else {
    console.log('ℹ️ No MySQL config found. Using Local JSON Database.');
    useLocalDb = true;
  }

  // Ensure Local Database directory and file exist safely (never throw on read-only environments)
  try {
    if (!fs.existsSync(LOCAL_DB_DIR)) {
      fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
    }

    if (!fs.existsSync(LOCAL_DB_PATH)) {
      console.log('🌱 Seeding local database JSON file...');
      const seedData = getSeedData();
      fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(seedData, null, 2), 'utf-8');
      memoryDb = seedData;
    }
  } catch (fsErr) {
    console.warn('⚠️ Note: Running in read-only environment or /tmp fallback. Using in-memory store.');
    if (!memoryDb) {
      memoryDb = getSeedData();
    }
  }
}

// Default Seed Data Generator
function getSeedData() {
  return {
    employee_details: [
      {
        id: 1,
        employee_code: 'SUPER01',
        employee_name: 'Super Administrator',
        password: 'super123', // Clean fallback passwords for sandbox
        user_role: 'Super Admin',
        center_code: 'HQ01',
        center_name: 'Premji Headquarters',
        user_details: 'Super Administrator & Operations Director',
        employee_doj: '2022-01-01',
        employee_status: 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 2,
        employee_code: 'ADMIN01',
        employee_name: 'Admin Manager',
        password: 'admin123',
        user_role: 'Admin',
        center_code: 'C01',
        center_name: 'Premji Chennai South',
        user_details: 'Workshop Operations Administrator',
        employee_doj: '2022-06-15',
        employee_status: 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 3,
        employee_code: 'TL01',
        employee_name: 'Karthik Raja',
        password: 'tl123',
        user_role: 'TeamLeader',
        center_code: 'C01',
        center_name: 'Premji Chennai South',
        user_details: 'Senior Workshop Floor Lead',
        employee_doj: '2023-02-01',
        employee_status: 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 4,
        employee_code: 'TECH01',
        employee_name: 'Suresh Kumar',
        password: 'tech123',
        user_role: 'Technician',
        center_code: 'C01',
        center_name: 'Premji Chennai South',
        user_details: 'Diagnostic & Mechanical Specialist',
        employee_doj: '2023-05-10',
        employee_status: 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 5,
        employee_code: 'TECH02',
        employee_name: 'Ramesh Patel',
        password: 'tech123',
        user_role: 'Technician',
        center_code: 'C02',
        center_name: 'Premji Chennai West',
        user_details: 'Electrical & AC Specialist',
        employee_doj: '2023-08-20',
        employee_status: 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 6,
        employee_code: 'ACCT01',
        employee_name: 'Deepa Natarajan',
        password: 'acct123',
        user_role: 'Accounts',
        center_code: 'C01',
        center_name: 'Premji Chennai South',
        user_details: 'Accounts Officer - Billing & Invoicing',
        employee_doj: '2023-09-01',
        employee_status: 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 7,
        employee_code: 'ENG01',
        employee_name: 'Arun Prakash',
        password: 'eng123',
        user_role: 'Engineer',
        center_code: 'C01',
        center_name: 'Premji Chennai South',
        user_details: 'Vehicle Systems Engineer',
        employee_doj: '2023-11-15',
        employee_status: 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    preamji_attendance: [
      {
        id: 1,
        emp_code_of_thetechnician: 'TECH01',
        name_of_technician: 'Suresh Kumar',
        center_code: 'C01',
        center_name: 'Premji Chennai South',
        attendance_date: new Date().toISOString().split('T')[0],
        on_duty_in_time: '09:15:00',
        on_duty_in_image: '/api/media/view?path=attendance/seed_in.webp',
        intermidiate_off_out_time: '13:00:00',
        intermidiate_off_out_image: '/api/media/view?path=attendance/seed_out.webp',
        intermidiate_off_in_time: '14:00:00',
        intermidiate_off_in_image: '/api/media/view?path=attendance/seed_in2.webp',
        on_duty_out_time: null,
        on_duty_out_image: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    workorder_entry: [
      {
        id: 1,
        jobcard_no: 'JC-2026-0001',
        jobcard_type: 'General Service',
        jobcard_date: new Date().toISOString().split('T')[0],
        center_code: 'C01',
        center_name: 'Premji Chennai South',
        technician_code: 'TECH01',
        technician_name: 'Suresh Kumar',
        team_leader_code: 'TL01',
        team_leader_name: 'Karthik Raja',
        Vehicle_Manufacturer: 'Maruti Suzuki',
        Vehicle_Model: 'Swift LXI',
        vehicle_reg_no: 'TN-01-AB-1234',
        customer_name: 'Anand Gopal',
        customer_mobile: '+919000001111',
        jobcard_photo: '/api/media/view?path=workorders/seed_jobcard.webp',
        status: 'Work In Progress',
        estimated_delivery: new Date(Date.now() + 86400000).toISOString().replace('T', ' ').substring(0, 19),
        remarks: 'Engine oil replacement, water wash requested, brake pads check.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 2,
        jobcard_no: 'JC-2026-0002',
        jobcard_type: 'Body Repair & Painting',
        jobcard_date: new Date().toISOString().split('T')[0],
        center_code: 'C01',
        center_name: 'Premji Chennai South',
        technician_code: null,
        technician_name: null,
        team_leader_code: 'TL01',
        team_leader_name: 'Karthik Raja',
        Vehicle_Manufacturer: 'Hyundai',
        Vehicle_Model: 'Creta 1.5 S+',
        vehicle_reg_no: 'TN-02-CD-5678',
        customer_name: 'Sanjay Reddy',
        customer_mobile: '+919111112222',
        jobcard_photo: null,
        status: 'Allocated',
        estimated_delivery: new Date(Date.now() + 172800000).toISOString().replace('T', ' ').substring(0, 19),
        remarks: 'Right side bumper dent removal & painting.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    center_details: [
      {
        id: 1,
        center_code: 'C01',
        center_name: 'Premji Chennai South',
        center_location: 'Guindy, Chennai, Tamil Nadu',
        center_type: 'Workshop',
        status: 'Active',
        created_at: new Date().toISOString()
      },
      {
        id: 2,
        center_code: 'C02',
        center_name: 'Premji Chennai West',
        center_location: 'Ambattur, Chennai, Tamil Nadu',
        center_type: 'Workshop',
        status: 'Active',
        created_at: new Date().toISOString()
      },
      {
        id: 3,
        center_code: 'C03',
        center_name: 'Premji Chennai North',
        center_location: 'Madhavaram, Chennai, Tamil Nadu',
        center_type: 'Workshop',
        status: 'Active',
        created_at: new Date().toISOString()
      }
    ],
    vehicle_model: [
      { id: 1, Vehicle_Manufacturer: 'Maruti Suzuki', Vehicle_Model: 'Swift' },
      { id: 2, Vehicle_Manufacturer: 'Maruti Suzuki', Vehicle_Model: 'Baleno' },
      { id: 3, Vehicle_Manufacturer: 'Maruti Suzuki', Vehicle_Model: 'Brezza' },
      { id: 4, Vehicle_Manufacturer: 'Hyundai', Vehicle_Model: 'i20' },
      { id: 5, Vehicle_Manufacturer: 'Hyundai', Vehicle_Model: 'Creta' },
      { id: 6, Vehicle_Manufacturer: 'Hyundai', Vehicle_Model: 'Verna' },
      { id: 7, Vehicle_Manufacturer: 'Tata', Vehicle_Model: 'Nexon' },
      { id: 8, Vehicle_Manufacturer: 'Tata', Vehicle_Model: 'Punch' },
      { id: 9, Vehicle_Manufacturer: 'Tata', Vehicle_Model: 'Harrier' },
      { id: 10, Vehicle_Manufacturer: 'Mahindra', Vehicle_Model: 'Thar' },
      { id: 11, Vehicle_Manufacturer: 'Mahindra', Vehicle_Model: 'XUV700' },
      { id: 12, Vehicle_Manufacturer: 'Mahindra', Vehicle_Model: 'Scorpio' }
    ]
  };
}

// JSON file helper functions with memory cache fallback
function readLocalDb(): any {
  if (memoryDb) {
    return memoryDb;
  }
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const data = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
      memoryDb = JSON.parse(data);
      return memoryDb;
    }
  } catch (err) {
    console.warn('Error reading local db file, falling back to memory seed', err);
  }
  memoryDb = getSeedData();
  return memoryDb;
}

function writeLocalDb(data: any) {
  memoryDb = data;
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    // Read-only filesystem warning is suppressed since memoryDb holds current state
  }
}

// Convert any binary Buffer columns returned from MySQL into clean UTF-8 strings
export function cleanRowBuffers<T = any>(data: T): T {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) {
    return data.map(item => cleanRowBuffers(item)) as unknown as T;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString('utf-8') as unknown as T;
  }
  if (typeof data === 'object') {
    if ((data as any).type === 'Buffer' && Array.isArray((data as any).data)) {
      return Buffer.from((data as any).data).toString('utf-8') as unknown as T;
    }
    const cleaned: any = {};
    for (const [key, val] of Object.entries(data)) {
      cleaned[key] = cleanRowBuffers(val);
    }
    return cleaned;
  }
  return data;
}

// Generic database wrapper functions
export const db = {
  // 1. Employee Auth & Details
  async getEmployeeByCode(code: string, activeOnly = false): Promise<EmployeeDetails | null> {
    if (!useLocalDb && mysqlPool) {
      let query = 'SELECT * FROM employee_details WHERE employee_code = ?';
      if (activeOnly) {
        query += ' AND employee_status IN ("Active", "1")';
      }
      query += ' LIMIT 1';
      const [rows]: any = await mysqlPool.execute(query, [code]);
      return rows[0] ? cleanRowBuffers(rows[0]) : null;
    } else {
      const store = readLocalDb();
      const emp = store.employee_details.find(
        (e: any) =>
          e.employee_code.toUpperCase() === code.toUpperCase() &&
          (!activeOnly || e.employee_status === 'Active' || e.employee_status === '1')
      );
      return emp || null;
    }
  },

  async getAllEmployees(): Promise<EmployeeDetails[]> {
    if (!useLocalDb && mysqlPool) {
      const [rows]: any = await mysqlPool.execute('SELECT * FROM employee_details ORDER BY id DESC');
      return cleanRowBuffers(rows);
    } else {
      const store = readLocalDb();
      return store.employee_details;
    }
  },

  async createEmployee(employee: Partial<EmployeeDetails>): Promise<number> {
    if (!useLocalDb && mysqlPool) {
      const [result]: any = await mysqlPool.execute(
        `INSERT INTO employee_details 
        (employee_code, employee_name, password, user_role, center_code, center_name, user_details, employee_doj, employee_status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          employee.employee_code,
          employee.employee_name,
          employee.password || '123456',
          employee.user_role || 'Technician',
          employee.center_code || null,
          employee.center_name || null,
          employee.user_details || null,
          employee.employee_doj || null,
          employee.employee_status || 'Active'
        ]
      );
      return result.insertId;
    } else {
      const store = readLocalDb();
      const newId = store.employee_details.length > 0 ? Math.max(...store.employee_details.map((e: any) => e.id)) + 1 : 1;
      const newEmp: EmployeeDetails = {
        id: newId,
        employee_code: employee.employee_code!,
        employee_name: employee.employee_name!,
        password: employee.password || '123456',
        user_role: employee.user_role as any,
        center_code: employee.center_code || null,
        center_name: employee.center_name || null,
        user_details: employee.user_details || null,
        employee_doj: employee.employee_doj || null,
        employee_status: employee.employee_status || 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      store.employee_details.push(newEmp);
      writeLocalDb(store);
      return newId;
    }
  },

  async updateEmployee(id: number, employee: Partial<EmployeeDetails>): Promise<boolean> {
    if (!useLocalDb && mysqlPool) {
      const fields: string[] = [];
      const values: any[] = [];
      Object.entries(employee).forEach(([key, val]) => {
        // Strip out mobile_no and email if passed, as MySQL table does not have them
        if (key !== 'id' && key !== 'created_at' && key !== 'updated_at' && key !== 'mobile_no' && key !== 'email') {
          fields.push(`${key} = ?`);
          values.push(val);
        }
      });
      if (fields.length === 0) return true;
      values.push(id);
      const [result]: any = await mysqlPool.execute(
        `UPDATE employee_details SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
      return result.affectedRows > 0;
    } else {
      const store = readLocalDb();
      const index = store.employee_details.findIndex((e: any) => e.id === id);
      if (index === -1) return false;
      const safeEmployee: any = { ...employee };
      delete safeEmployee.mobile_no;
      delete safeEmployee.email;
      store.employee_details[index] = {
        ...store.employee_details[index],
        ...safeEmployee,
        updated_at: new Date().toISOString()
      };
      writeLocalDb(store);
      return true;
    }
  },

  // 2. Attendance & Checkpoint operations
  async getTodayAttendance(empCode: string, dateStr: string): Promise<PremjiAttendance | null> {
    if (!useLocalDb && mysqlPool) {
      const [rows]: any = await mysqlPool.execute(
        `SELECT a.*, e.center_code, e.center_name 
         FROM preamji_attendance a 
         LEFT JOIN employee_details e ON a.emp_code_of_thetechnician = e.employee_code 
         WHERE a.emp_code_of_thetechnician = ? AND a.attendance_date = ? LIMIT 1`,
        [empCode, dateStr]
      );
      return rows[0] ? cleanRowBuffers(rows[0]) : null;
    } else {
      const store = readLocalDb();
      const attendance = store.preamji_attendance.find(
        (a: any) => a.emp_code_of_thetechnician === empCode && a.attendance_date === dateStr
      );
      return attendance || null;
    }
  },

  async markAttendance(attendance: Partial<PremjiAttendance>): Promise<boolean> {
    const dateStr = attendance.attendance_date!;
    const empCode = attendance.emp_code_of_thetechnician!;

    if (!useLocalDb && mysqlPool) {
      // Look up if existing record
      const [rows]: any = await mysqlPool.execute(
        'SELECT id FROM preamji_attendance WHERE emp_code_of_thetechnician = ? AND attendance_date = ? LIMIT 1',
        [empCode, dateStr]
      );

      if (rows.length > 0) {
        const fields: string[] = [];
        const values: any[] = [];
        const keys = [
          'on_duty_in_time', 'on_duty_in_image',
          'intermidiate_off_out_time', 'intermidiate_off_out_image',
          'intermidiate_off_in_time', 'intermidiate_off_in_image',
          'on_duty_out_time', 'on_duty_out_image'
        ];

        keys.forEach(key => {
          if ((attendance as any)[key] !== undefined) {
            fields.push(`${key} = ?`);
            let val = (attendance as any)[key];
            if (key.endsWith('_time') && val) {
              val = toMysqlDatetime(val, dateStr);
            }
            values.push(val);
          }
        });

        if (fields.length === 0) return true;
        values.push(rows[0].id);

        const [result]: any = await mysqlPool.execute(
          `UPDATE preamji_attendance SET ${fields.join(', ')} WHERE id = ?`,
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
            const [result]: any = await mysqlPool.execute(
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
            return result.insertId > 0;
          } catch (e: any) {
            if (e.code === 'ER_BAD_FIELD_ERROR') {
              attendanceTableHasCenterCode = false;
            } else {
              throw e;
            }
          }
        }

        const [result]: any = await mysqlPool.execute(
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
        (a: any) => a.emp_code_of_thetechnician === empCode && a.attendance_date === dateStr
      );

      if (index !== -1) {
        store.preamji_attendance[index] = {
          ...store.preamji_attendance[index],
          ...attendance,
          updated_at: new Date().toISOString()
        };
      } else {
        const newId = store.preamji_attendance.length > 0 ? Math.max(...store.preamji_attendance.map((a: any) => a.id)) + 1 : 1;
        const newAtt: PremjiAttendance = {
          id: newId,
          emp_code_of_thetechnician: empCode,
          name_of_technician: attendance.name_of_technician!,
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
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        store.preamji_attendance.push(newAtt);
      }
      writeLocalDb(store);
      return true;
    }
  },

  async getAttendanceHistory(empCode: string, limit = 30): Promise<PremjiAttendance[]> {
    if (!useLocalDb && mysqlPool) {
      const [rows]: any = await mysqlPool.execute(
        `SELECT a.*, e.center_code, e.center_name 
         FROM preamji_attendance a 
         LEFT JOIN employee_details e ON a.emp_code_of_thetechnician = e.employee_code 
         WHERE a.emp_code_of_thetechnician = ? ORDER BY a.attendance_date DESC LIMIT ?`,
        [empCode, limit]
      );
      return cleanRowBuffers(rows);
    } else {
      const store = readLocalDb();
      return store.preamji_attendance
        .filter((a: any) => a.emp_code_of_thetechnician === empCode)
        .sort((a: any, b: any) => b.attendance_date.localeCompare(a.attendance_date))
        .slice(0, limit);
    }
  },

  async getAttendanceAdminReport(filters: {
    startDate?: string;
    endDate?: string;
    centerCode?: string;
    employeeCode?: string;
  }): Promise<PremjiAttendance[]> {
    if (!useLocalDb && mysqlPool) {
      let query = `SELECT a.*, e.center_code, e.center_name 
                   FROM preamji_attendance a 
                   LEFT JOIN employee_details e ON a.emp_code_of_thetechnician = e.employee_code 
                   WHERE 1=1`;
      const params: any[] = [];

      if (filters.startDate) {
        query += ' AND a.attendance_date >= ?';
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        query += ' AND a.attendance_date <= ?';
        params.push(filters.endDate);
      }
      if (filters.centerCode) {
        query += ' AND e.center_code = ?';
        params.push(filters.centerCode);
      }
      if (filters.employeeCode) {
        query += ' AND a.emp_code_of_thetechnician = ?';
        params.push(filters.employeeCode);
      }

      query += ' ORDER BY a.attendance_date DESC';
      const [rows]: any = await mysqlPool.execute(query, params);
      return cleanRowBuffers(rows);
    } else {
      const store = readLocalDb();
      let records = [...store.preamji_attendance];

      if (filters.startDate) {
        records = records.filter(r => r.attendance_date >= filters.startDate!);
      }
      if (filters.endDate) {
        records = records.filter(r => r.attendance_date <= filters.endDate!);
      }
      if (filters.centerCode) {
        records = records.filter(r => r.center_code === filters.centerCode);
      }
      if (filters.employeeCode) {
        records = records.filter(r => r.emp_code_of_thetechnician === filters.employeeCode);
      }

      return records.sort((a, b) => b.attendance_date.localeCompare(a.attendance_date));
    }
  },

  // 3. Work Orders Management
  async getWorkOrders(filters: {
    search?: string;
    jobcard_type?: string;
    job_status?: string;
    status?: string;
    centerCode?: string;
    technicianCode?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: WorkorderEntry[]; total: number }> {
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    if (!useLocalDb && mysqlPool) {
      // Strictly exclude soft-deleted records (delete_flag != 1)
      let query = 'SELECT * FROM workorder_entry WHERE (delete_flag = 0 OR delete_flag IS NULL)';
      let countQuery = 'SELECT COUNT(*) as total FROM workorder_entry WHERE (delete_flag = 0 OR delete_flag IS NULL)';
      const params: any[] = [];
      const countParams: any[] = [];

      if (filters.search) {
        const searchLike = `%${filters.search}%`;
        const searchSql = ' AND (jobcard_no LIKE ? OR vehicle_registration_no LIKE ? OR name_of_technician LIKE ? OR vehicle_manufacturer LIKE ? OR vehicle_model LIKE ? OR name_of_service_advisor LIKE ?)';
        query += searchSql;
        countQuery += searchSql;
        params.push(searchLike, searchLike, searchLike, searchLike, searchLike, searchLike);
        countParams.push(searchLike, searchLike, searchLike, searchLike, searchLike, searchLike);
      }

      if (filters.jobcard_type) {
        query += ' AND jobcard_type = ?';
        countQuery += ' AND jobcard_type = ?';
        params.push(filters.jobcard_type);
        countParams.push(filters.jobcard_type);
      }

      if (filters.job_status || filters.status) {
        const st = filters.job_status || filters.status;
        query += ' AND job_status = ?';
        countQuery += ' AND job_status = ?';
        params.push(st);
        countParams.push(st);
      }

      if (filters.centerCode) {
        query += ' AND center_code = ?';
        countQuery += ' AND center_code = ?';
        params.push(filters.centerCode);
        countParams.push(filters.centerCode);
      }

      if (filters.technicianCode) {
        query += ' AND technician_code = ?';
        countQuery += ' AND technician_code = ?';
        params.push(filters.technicianCode);
        countParams.push(filters.technicianCode);
      }

      if (filters.startDate) {
        query += ' AND (job_assign_date >= ? OR jobcard_date >= ?)';
        countQuery += ' AND (job_assign_date >= ? OR jobcard_date >= ?)';
        params.push(filters.startDate, filters.startDate);
        countParams.push(filters.startDate, filters.startDate);
      }

      if (filters.endDate) {
        query += ' AND (job_assign_date <= ? OR jobcard_date <= ?)';
        countQuery += ' AND (job_assign_date <= ? OR jobcard_date <= ?)';
        params.push(filters.endDate, filters.endDate);
        countParams.push(filters.endDate, filters.endDate);
      }

      query += ' ORDER BY COALESCE(job_assign_date, jobcard_date) DESC, id DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [rows]: any = await mysqlPool.execute(query, params);
      const [countRows]: any = await mysqlPool.execute(countQuery, countParams);

      return {
        data: cleanRowBuffers(rows),
        total: countRows[0]?.total || 0
      };
    } else {
      const store = readLocalDb();
      let records: WorkorderEntry[] = [...(store.workorder_entry || [])].filter(
        (r: any) => r.delete_flag !== 1 && r.delete_flag !== '1'
      );

      if (filters.search) {
        const search = filters.search.toLowerCase();
        records = records.filter(
          r =>
            (r.jobcard_no && r.jobcard_no.toLowerCase().includes(search)) ||
            (r.vehicle_registration_no && r.vehicle_registration_no.toLowerCase().includes(search)) ||
            (r.name_of_technician && r.name_of_technician.toLowerCase().includes(search)) ||
            (r.vehicle_manufacturer && r.vehicle_manufacturer.toLowerCase().includes(search)) ||
            (r.vehicle_model && r.vehicle_model.toLowerCase().includes(search))
        );
      }

      if (filters.jobcard_type) {
        records = records.filter(r => r.jobcard_type === filters.jobcard_type);
      }

      if (filters.job_status || filters.status) {
        const st = filters.job_status || filters.status;
        records = records.filter(r => r.job_status === st);
      }

      if (filters.centerCode) {
        records = records.filter(r => r.center_code === filters.centerCode);
      }

      if (filters.technicianCode) {
        records = records.filter(r => r.technician_code === filters.technicianCode);
      }

      if (filters.startDate) {
        records = records.filter(r => (r.job_assign_date || r.jobcard_date) >= filters.startDate!);
      }

      if (filters.endDate) {
        records = records.filter(r => (r.job_assign_date || r.jobcard_date) <= filters.endDate!);
      }

      const total = records.length;
      const sortedRecords = records
        .sort((a, b) => (b.job_assign_date || b.jobcard_date).localeCompare(a.job_assign_date || a.jobcard_date) || ((b.id || 0) - (a.id || 0)))
        .slice(offset, offset + limit);

      return {
        data: sortedRecords,
        total
      };
    }
  },

  async getWorkOrderById(id: number): Promise<WorkorderEntry | null> {
    if (!useLocalDb && mysqlPool) {
      const [rows]: any = await mysqlPool.execute(
        'SELECT * FROM workorder_entry WHERE id = ? LIMIT 1',
        [id]
      );
      return rows[0] ? cleanRowBuffers(rows[0]) : null;
    } else {
      const store = readLocalDb();
      return store.workorder_entry.find((w: any) => w.id === id) || null;
    }
  },

  async checkOpenWorkOrderExists(centerCode: string, jobcardNo: string, vehicleRegNo?: string): Promise<boolean> {
    if (!useLocalDb && mysqlPool) {
      if (vehicleRegNo) {
        const [rows]: any = await mysqlPool.execute(
          `SELECT id FROM workorder_entry 
           WHERE (jobcard_no = ? OR vehicle_registration_no = ?) 
             AND job_status = 'In Progress' 
             AND (delete_flag = 0 OR delete_flag IS NULL) 
           LIMIT 1`,
          [jobcardNo, vehicleRegNo]
        );
        return rows.length > 0;
      } else {
        const [rows]: any = await mysqlPool.execute(
          `SELECT id FROM workorder_entry 
           WHERE jobcard_no = ? 
             AND center_code = ? 
             AND job_status = 'In Progress' 
             AND (delete_flag = 0 OR delete_flag IS NULL) 
           LIMIT 1`,
          [jobcardNo, centerCode]
        );
        return rows.length > 0;
      }
    } else {
      const store = readLocalDb();
      return store.workorder_entry.some((w: any) => {
        if (w.delete_flag === 1 || w.delete_flag === '1') return false;
        if (w.job_status !== 'In Progress') return false;
        if (vehicleRegNo && w.vehicle_registration_no === vehicleRegNo) return true;
        if (w.jobcard_no === jobcardNo && (!centerCode || w.center_code === centerCode)) return true;
        return false;
      });
    }
  },

  async getOpenJobcards(centerCode?: string): Promise<WorkorderEntry[]> {
    if (!useLocalDb && mysqlPool) {
      let query = "SELECT * FROM workorder_entry WHERE job_status = 'In Progress' AND (delete_flag = 0 OR delete_flag IS NULL)";
      const params: any[] = [];
      if (centerCode) {
        query += " AND center_code = ?";
        params.push(centerCode);
      }
      query += " ORDER BY id DESC";
      const [rows]: any = await mysqlPool.execute(query, params);
      return cleanRowBuffers(rows);
    } else {
      const store = readLocalDb();
      return store.workorder_entry.filter((w: any) => {
        if (w.delete_flag === 1 || w.delete_flag === '1') return false;
        if (w.job_status !== 'In Progress') return false;
        if (centerCode && w.center_code !== centerCode) return false;
        return true;
      });
    }
  },

  async getClosedJobcards(centerCode?: string, days = 30): Promise<WorkorderEntry[]> {
    if (!useLocalDb && mysqlPool) {
      let query = `SELECT * FROM workorder_entry 
                   WHERE job_status = 'Closed' 
                     AND (delete_flag = 0 OR delete_flag IS NULL)
                     AND (job_compleate_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY) OR job_compleate_date IS NULL)`;
      const params: any[] = [days];
      if (centerCode) {
        query += " AND center_code = ?";
        params.push(centerCode);
      }
      query += " ORDER BY job_compleate_date DESC, id DESC LIMIT 100";
      const [rows]: any = await mysqlPool.execute(query, params);
      return cleanRowBuffers(rows);
    } else {
      const store = readLocalDb();
      return store.workorder_entry.filter((w: any) => {
        if (w.delete_flag === 1 || w.delete_flag === '1') return false;
        if (w.job_status !== 'Closed') return false;
        if (centerCode && w.center_code !== centerCode) return false;
        return true;
      });
    }
  },

  async createWorkOrder(order: Partial<WorkorderEntry>): Promise<number> {
    if (!useLocalDb && mysqlPool) {
      const [result]: any = await mysqlPool.execute(
        `INSERT INTO workorder_entry 
        (jobcard_type, technician_code, name_of_technician, jobcard_photo, previous_jobcard_no,
         vehicle_registration_no, vehicle_manufacturer, vehicle_model, vehicle_variant,
         jobcard_no, jobcard_date, job_assign_date, kilometres, name_of_service_advisor,
         center_code, center_name, center_location, job_start_time, tl_id, tl_last_update,
         tl_remarks, job_status, delete_flag) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, 0)`,
        [
          order.jobcard_type || 'New workorder',
          order.technician_code || null,
          order.name_of_technician || null,
          order.jobcard_photo || null,
          order.previous_jobcard_no || null,
          order.vehicle_registration_no || '',
          order.vehicle_manufacturer || '',
          order.vehicle_model || '',
          order.vehicle_variant || null,
          order.jobcard_no || '',
          order.jobcard_date || new Date().toISOString().split('T')[0],
          order.job_assign_date || new Date().toISOString().split('T')[0],
          order.kilometres ? Number(order.kilometres) : null,
          order.name_of_service_advisor || null,
          order.center_code || null,
          order.center_name || null,
          order.center_location || null,
          order.job_start_time || null,
          order.tl_id || null,
          order.tl_remarks || null,
          order.job_status || 'In Progress'
        ]
      );
      return result.insertId;
    } else {
      const store = readLocalDb();
      const newId = store.workorder_entry.length > 0 ? Math.max(...store.workorder_entry.map((w: any) => w.id || 0)) + 1 : 1;
      const newOrder: WorkorderEntry = {
        id: newId,
        jobcard_type: order.jobcard_type || 'New workorder',
        technician_code: order.technician_code || null,
        name_of_technician: order.name_of_technician || null,
        jobcard_photo: order.jobcard_photo || null,
        previous_jobcard_no: order.previous_jobcard_no || null,
        vehicle_registration_no: order.vehicle_registration_no || '',
        vehicle_manufacturer: order.vehicle_manufacturer || '',
        vehicle_model: order.vehicle_model || '',
        vehicle_variant: order.vehicle_variant || null,
        jobcard_no: order.jobcard_no || '',
        jobcard_date: order.jobcard_date || new Date().toISOString().split('T')[0],
        job_assign_date: order.job_assign_date || new Date().toISOString().split('T')[0],
        kilometres: order.kilometres ? Number(order.kilometres) : null,
        name_of_service_advisor: order.name_of_service_advisor || null,
        center_code: order.center_code || null,
        center_name: order.center_name || null,
        center_location: order.center_location || null,
        job_start_time: order.job_start_time || null,
        tl_id: order.tl_id || null,
        tl_last_update: new Date().toISOString(),
        tl_remarks: order.tl_remarks || null,
        job_status: order.job_status || 'In Progress',
        delete_flag: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      store.workorder_entry.push(newOrder);
      writeLocalDb(store);
      return newId;
    }
  },

  // Atomic Two-Step Re-assignment (Mode 2)
  async reassignWorkOrder(
    oldId: number,
    newAssignDate: string,
    newTechCode: string,
    newTechName: string,
    tlId: string,
    tlRemarks: string
  ): Promise<{ success: boolean; newId?: number; error?: string }> {
    if (!useLocalDb && mysqlPool) {
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();

        // 1. Fetch old record
        const [rows]: any = await conn.execute('SELECT * FROM workorder_entry WHERE id = ? FOR UPDATE', [oldId]);
        if (rows.length === 0) {
          await conn.rollback();
          return { success: false, error: 'Old work order record not found' };
        }
        const old = cleanRowBuffers(rows[0]);

        // 2. UPDATE old record: job_status = 'Re-assigned', tl_remarks, tl_last_update = NOW()
        await conn.execute(
          "UPDATE workorder_entry SET job_status = 'Re-assigned', tl_remarks = ?, tl_last_update = NOW() WHERE id = ?",
          [tlRemarks, oldId]
        );

        // 3. INSERT new record: jobcard_type = 'Re-assigned job', job_status = 'In Progress', copying vehicle info & photo
        const [insertRes]: any = await conn.execute(
          `INSERT INTO workorder_entry 
          (jobcard_type, technician_code, name_of_technician, jobcard_photo, previous_jobcard_no,
           vehicle_registration_no, vehicle_manufacturer, vehicle_model, vehicle_variant,
           jobcard_no, jobcard_date, job_assign_date, kilometres, name_of_service_advisor,
           center_code, center_name, center_location, tl_id, tl_last_update,
           tl_remarks, job_status, delete_flag) 
           VALUES ('Re-assigned job', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, 'In Progress', 0)`,
          [
            newTechCode,
            newTechName,
            old.jobcard_photo || null,
            old.jobcard_no, // previous_jobcard_no
            old.vehicle_registration_no,
            old.vehicle_manufacturer,
            old.vehicle_model,
            old.vehicle_variant,
            old.jobcard_no,
            old.jobcard_date,
            newAssignDate,
            old.kilometres,
            old.name_of_service_advisor,
            old.center_code,
            old.center_name,
            old.center_location,
            tlId,
            tlRemarks
          ]
        );

        await conn.commit();
        return { success: true, newId: insertRes.insertId };
      } catch (err: any) {
        await conn.rollback();
        console.error('reassignWorkOrder error:', err);
        return { success: false, error: err.message };
      } finally {
        conn.release();
      }
    } else {
      const store = readLocalDb();
      const oldIndex = store.workorder_entry.findIndex((w: any) => w.id === oldId);
      if (oldIndex === -1) return { success: false, error: 'Old record not found' };

      const old = store.workorder_entry[oldIndex];
      old.job_status = 'Re-assigned';
      old.tl_remarks = tlRemarks;
      old.tl_last_update = new Date().toISOString();

      const newId = Math.max(...store.workorder_entry.map((w: any) => w.id || 0)) + 1;
      const newOrder: WorkorderEntry = {
        ...old,
        id: newId,
        jobcard_type: 'Re-assigned job',
        technician_code: newTechCode,
        name_of_technician: newTechName,
        job_assign_date: newAssignDate,
        previous_jobcard_no: old.jobcard_no,
        tl_id: tlId,
        tl_remarks: tlRemarks,
        tl_last_update: new Date().toISOString(),
        job_status: 'In Progress',
        delete_flag: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      store.workorder_entry.push(newOrder);
      writeLocalDb(store);
      return { success: true, newId };
    }
  },

  // Close Work Order with 14 service counts (Mode 5)
  async closeWorkOrder(
    id: number,
    services: {
      brake_testing?: number;
      carbon_cleaning_decarb?: number;
      disc_cutting?: number;
      drum_cutting?: number;
      puncture_removed?: number;
      tpms_replacement?: number;
      tyre_fitting?: number;
      wheel_tyre_rotation?: number;
      wheel_balancing?: number;
      wheel_alignment?: number;
      washing_and_cleaning?: number;
      exterior_polishing?: number;
      interior_cleaning?: number;
      paint_protection_film?: number;
    },
    tlRemarks?: string,
    tlId?: string
  ): Promise<boolean> {
    const nowIST = new Date();
    const istDate = nowIST.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const istTime = nowIST.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    if (!useLocalDb && mysqlPool) {
      const [result]: any = await mysqlPool.execute(
        `UPDATE workorder_entry SET 
          job_status = 'Closed',
          job_compleate_date = ?,
          job_compleate_time = ?,
          tl_remarks = COALESCE(?, tl_remarks),
          tl_id = COALESCE(?, tl_id),
          tl_last_update = NOW(),
          brake_testing = ?,
          carbon_cleaning_decarb = ?,
          disc_cutting = ?,
          drum_cutting = ?,
          puncture_removed = ?,
          tpms_replacement = ?,
          tyre_fitting = ?,
          wheel_tyre_rotation = ?,
          wheel_balancing = ?,
          wheel_alignment = ?,
          washing_and_cleaning = ?,
          exterior_polishing = ?,
          interior_cleaning = ?,
          paint_protection_film = ?
         WHERE id = ?`,
        [
          istDate,
          istTime,
          tlRemarks || null,
          tlId || null,
          Number(services.brake_testing || 0),
          Number(services.carbon_cleaning_decarb || 0),
          Number(services.disc_cutting || 0),
          Number(services.drum_cutting || 0),
          Number(services.puncture_removed || 0),
          Number(services.tpms_replacement || 0),
          Number(services.tyre_fitting || 0),
          Number(services.wheel_tyre_rotation || 0),
          Number(services.wheel_balancing || 0),
          Number(services.wheel_alignment || 0),
          Number(services.washing_and_cleaning || 0),
          Number(services.exterior_polishing || 0),
          Number(services.interior_cleaning || 0),
          Number(services.paint_protection_film || 0),
          id
        ]
      );
      return result.affectedRows > 0;
    } else {
      const store = readLocalDb();
      const index = store.workorder_entry.findIndex((w: any) => w.id === id);
      if (index === -1) return false;

      store.workorder_entry[index] = {
        ...store.workorder_entry[index],
        job_status: 'Closed',
        job_compleate_date: istDate,
        job_compleate_time: istTime,
        tl_remarks: tlRemarks || store.workorder_entry[index].tl_remarks,
        tl_id: tlId || store.workorder_entry[index].tl_id,
        tl_last_update: new Date().toISOString(),
        brake_testing: Number(services.brake_testing || 0),
        carbon_cleaning_decarb: Number(services.carbon_cleaning_decarb || 0),
        disc_cutting: Number(services.disc_cutting || 0),
        drum_cutting: Number(services.drum_cutting || 0),
        puncture_removed: Number(services.puncture_removed || 0),
        tpms_replacement: Number(services.tpms_replacement || 0),
        tyre_fitting: Number(services.tyre_fitting || 0),
        wheel_tyre_rotation: Number(services.wheel_tyre_rotation || 0),
        wheel_balancing: Number(services.wheel_balancing || 0),
        wheel_alignment: Number(services.wheel_alignment || 0),
        washing_and_cleaning: Number(services.washing_and_cleaning || 0),
        exterior_polishing: Number(services.exterior_polishing || 0),
        interior_cleaning: Number(services.interior_cleaning || 0),
        paint_protection_film: Number(services.paint_protection_film || 0)
      };
      writeLocalDb(store);
      return true;
    }
  },

  // Admin Update details
  async adminUpdateWorkOrder(
    id: number,
    data: {
      vehicle_manufacturer?: string;
      vehicle_model?: string;
      vehicle_variant?: string;
      vehicle_registration_no?: string;
      jobcard_type?: string;
      technician_code?: string;
      name_of_technician?: string;
      jobcard_no?: string;
      jobcard_date?: string;
      kilometres?: number;
      name_of_service_advisor?: string;
      job_status?: string;
      admin_remarks?: string;
      jobcard_photo?: string;
    },
    adminId: string
  ): Promise<boolean> {
    if (!useLocalDb && mysqlPool) {
      const fields: string[] = ['admin_id = ?', 'admin_last_update_time = NOW()'];
      const values: any[] = [adminId];

      if (data.vehicle_manufacturer !== undefined) { fields.push('vehicle_manufacturer = ?'); values.push(data.vehicle_manufacturer); }
      if (data.vehicle_model !== undefined) { fields.push('vehicle_model = ?'); values.push(data.vehicle_model); }
      if (data.vehicle_variant !== undefined) { fields.push('vehicle_variant = ?'); values.push(data.vehicle_variant); }
      if (data.vehicle_registration_no !== undefined) { fields.push('vehicle_registration_no = ?'); values.push(data.vehicle_registration_no); }
      if (data.jobcard_type !== undefined) { fields.push('jobcard_type = ?'); values.push(data.jobcard_type); }
      if (data.technician_code !== undefined) { fields.push('technician_code = ?'); values.push(data.technician_code); }
      if (data.name_of_technician !== undefined) { fields.push('name_of_technician = ?'); values.push(data.name_of_technician); }
      if (data.jobcard_no !== undefined) { fields.push('jobcard_no = ?'); values.push(data.jobcard_no); }
      if (data.jobcard_date !== undefined) { fields.push('jobcard_date = ?'); values.push(data.jobcard_date); }
      if (data.kilometres !== undefined) { fields.push('kilometres = ?'); values.push(data.kilometres ? Number(data.kilometres) : null); }
      if (data.name_of_service_advisor !== undefined) { fields.push('name_of_service_advisor = ?'); values.push(data.name_of_service_advisor); }
      if (data.job_status !== undefined) { fields.push('job_status = ?'); values.push(data.job_status); }
      if (data.admin_remarks !== undefined) { fields.push('admin_remarks = ?'); values.push(data.admin_remarks); }
      if (data.jobcard_photo !== undefined && data.jobcard_photo !== null) { fields.push('jobcard_photo = ?'); values.push(data.jobcard_photo); }

      values.push(id);
      const [result]: any = await mysqlPool.execute(
        `UPDATE workorder_entry SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
      return result.affectedRows > 0;
    } else {
      const store = readLocalDb();
      const index = store.workorder_entry.findIndex((w: any) => w.id === id);
      if (index === -1) return false;

      store.workorder_entry[index] = {
        ...store.workorder_entry[index],
        ...data,
        admin_id: adminId,
        admin_last_update_time: new Date().toISOString()
      };
      writeLocalDb(store);
      return true;
    }
  },

  // Soft Delete Record (delete_flag = 1)
  async softDeleteWorkOrder(id: number, adminId: string): Promise<boolean> {
    if (!useLocalDb && mysqlPool) {
      const [result]: any = await mysqlPool.execute(
        `UPDATE workorder_entry SET delete_flag = 1, admin_id = ?, admin_last_update_time = NOW() WHERE id = ?`,
        [adminId, id]
      );
      return result.affectedRows > 0;
    } else {
      const store = readLocalDb();
      const index = store.workorder_entry.findIndex((w: any) => w.id === id);
      if (index === -1) return false;

      store.workorder_entry[index].delete_flag = 1;
      store.workorder_entry[index].admin_id = adminId;
      store.workorder_entry[index].admin_last_update_time = new Date().toISOString();
      writeLocalDb(store);
      return true;
    }
  },

  async updateWorkOrder(id: number, fieldsToUpdate: Partial<WorkorderEntry>): Promise<boolean> {
    if (!useLocalDb && mysqlPool) {
      const fields: string[] = [];
      const values: any[] = [];
      Object.entries(fieldsToUpdate).forEach(([key, val]) => {
        if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
          fields.push(`${key} = ?`);
          values.push(val);
        }
      });
      if (fields.length === 0) return true;
      values.push(id);

      const [result]: any = await mysqlPool.execute(
        `UPDATE workorder_entry SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
      return result.affectedRows > 0;
    } else {
      const store = readLocalDb();
      const index = store.workorder_entry.findIndex((w: any) => w.id === id);
      if (index === -1) return false;

      store.workorder_entry[index] = {
        ...store.workorder_entry[index],
        ...fieldsToUpdate,
        updated_at: new Date().toISOString()
      };
      writeLocalDb(store);
      return true;
    }
  },

  // 4. Center management
  async getAllCenters(): Promise<CenterDetails[]> {
    if (!useLocalDb && mysqlPool) {
      const [rows]: any = await mysqlPool.execute('SELECT * FROM center_details WHERE status = "Active"');
      return cleanRowBuffers(rows);
    } else {
      const store = readLocalDb();
      return store.center_details.filter((c: any) => c.status === 'Active');
    }
  },

  async createCenter(center: Partial<CenterDetails>): Promise<string> {
    if (!useLocalDb && mysqlPool) {
      await mysqlPool.execute(
        'INSERT INTO center_details (center_code, center_name, center_location, center_type, status) VALUES (?, ?, ?, ?, ?)',
        [
          center.center_code,
          center.center_name,
          center.center_location,
          center.center_type || 'Workshop',
          center.status || 'Active'
        ]
      );
      return center.center_code!;
    } else {
      const store = readLocalDb();
      const newId = store.center_details.length > 0 ? Math.max(...store.center_details.map((c: any) => c.id)) + 1 : 1;
      const newCenter: CenterDetails = {
        id: newId,
        center_code: center.center_code!,
        center_name: center.center_name!,
        center_location: center.center_location!,
        center_type: center.center_type || 'Workshop',
        status: center.status || 'Active',
        created_at: new Date().toISOString()
      };
      store.center_details.push(newCenter);
      writeLocalDb(store);
      return center.center_code!;
    }
  },

  async updateCenter(centerCode: string, updates: Partial<CenterDetails>): Promise<boolean> {
    if (!useLocalDb && mysqlPool) {
      const fields: string[] = [];
      const values: any[] = [];
      Object.entries(updates).forEach(([key, val]) => {
        if (key !== 'id' && key !== 'center_code' && key !== 'created_at') {
          fields.push(`${key} = ?`);
          values.push(val);
        }
      });
      if (fields.length === 0) return true;
      values.push(centerCode);

      const [result]: any = await mysqlPool.execute(
        `UPDATE center_details SET ${fields.join(', ')} WHERE center_code = ?`,
        values
      );
      return result.affectedRows > 0;
    } else {
      const store = readLocalDb();
      const index = store.center_details.findIndex((c: any) => c.center_code === centerCode);
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
  async getVehicleModels(): Promise<VehicleModel[]> {
    if (!useLocalDb && mysqlPool) {
      const [rows]: any = await mysqlPool.execute('SELECT * FROM vehicle_model ORDER BY Vehicle_Manufacturer ASC, Vehicle_Model ASC');
      return cleanRowBuffers(rows);
    } else {
      const store = readLocalDb();
      return [...(store.vehicle_model || [])].sort((a: any, b: any) => {
        const mfrDiff = (a.Vehicle_Manufacturer || '').localeCompare(b.Vehicle_Manufacturer || '');
        if (mfrDiff !== 0) return mfrDiff;
        return (a.Vehicle_Model || '').localeCompare(b.Vehicle_Model || '');
      });
    }
  },

  async getAllVehicleModels(): Promise<VehicleModel[]> {
    return this.getVehicleModels();
  },

  async createVehicleModel(modelData: { Vehicle_Manufacturer: string; Vehicle_Model: string; Vehicle_Variant?: string }): Promise<{ success: boolean; id?: number; error?: string }> {
    const cleanMfr = (modelData.Vehicle_Manufacturer || '').trim();
    const cleanModel = (modelData.Vehicle_Model || '').trim();

    if (!cleanMfr || !cleanModel) {
      return { success: false, error: 'Both Vehicle Manufacturer and Vehicle Model are required.' };
    }

    if (!useLocalDb && mysqlPool) {
      // Check duplicate (case-insensitive & trimmed)
      const [existing]: any = await mysqlPool.execute(
        'SELECT ID FROM vehicle_model WHERE LOWER(TRIM(Vehicle_Manufacturer)) = LOWER(TRIM(?)) AND LOWER(TRIM(Vehicle_Model)) = LOWER(TRIM(?)) LIMIT 1',
        [cleanMfr, cleanModel]
      );
      if (existing.length > 0) {
        return { success: false, error: `Duplicate detected: "${cleanMfr} - ${cleanModel}" already exists in the vehicle database.` };
      }

      // Check max ID in case ID is not auto_increment
      let nextId: number | null = null;
      try {
        const [maxRows]: any = await mysqlPool.execute('SELECT COALESCE(MAX(ID), 0) + 1 AS next_id FROM vehicle_model');
        nextId = maxRows[0]?.next_id || 1;
      } catch {}

      let insertId = nextId;
      try {
        if (nextId) {
          const [res]: any = await mysqlPool.execute(
            'INSERT INTO vehicle_model (ID, Vehicle_Manufacturer, Vehicle_Model) VALUES (?, ?, ?)',
            [nextId, cleanMfr, cleanModel]
          );
          insertId = res.insertId || nextId;
        } else {
          const [res]: any = await mysqlPool.execute(
            'INSERT INTO vehicle_model (Vehicle_Manufacturer, Vehicle_Model) VALUES (?, ?)',
            [cleanMfr, cleanModel]
          );
          insertId = res.insertId;
        }
      } catch (err: any) {
        // Fallback without ID column if auto_increment handles it
        const [res]: any = await mysqlPool.execute(
          'INSERT INTO vehicle_model (Vehicle_Manufacturer, Vehicle_Model) VALUES (?, ?)',
          [cleanMfr, cleanModel]
        );
        insertId = res.insertId || nextId;
      }

      return { success: true, id: insertId || 1 };
    } else {
      const store = readLocalDb();
      if (!store.vehicle_model) store.vehicle_model = [];

      const duplicate = store.vehicle_model.some(
        (vm: any) =>
          vm.Vehicle_Manufacturer?.trim().toLowerCase() === cleanMfr.toLowerCase() &&
          vm.Vehicle_Model?.trim().toLowerCase() === cleanModel.toLowerCase()
      );

      if (duplicate) {
        return { success: false, error: `Duplicate detected: "${cleanMfr} - ${cleanModel}" already exists in the vehicle database.` };
      }

      const nextId = store.vehicle_model.length > 0 ? Math.max(...store.vehicle_model.map((m: any) => m.id || m.ID || 0)) + 1 : 1;
      const newModel: VehicleModel = {
        id: nextId,
        Vehicle_Manufacturer: cleanMfr,
        Vehicle_Model: cleanModel
      };

      store.vehicle_model.push(newModel);
      writeLocalDb(store);
      return { success: true, id: nextId };
    }
  },

  async updateVehicleModel(id: number, modelData: { Vehicle_Manufacturer: string; Vehicle_Model: string; Vehicle_Variant?: string }): Promise<{ success: boolean; error?: string }> {
    const cleanMfr = (modelData.Vehicle_Manufacturer || '').trim();
    const cleanModel = (modelData.Vehicle_Model || '').trim();

    if (!cleanMfr || !cleanModel) {
      return { success: false, error: 'Both Vehicle Manufacturer and Vehicle Model are required.' };
    }

    if (!useLocalDb && mysqlPool) {
      // Check duplicate on other records
      const [existing]: any = await mysqlPool.execute(
        'SELECT ID FROM vehicle_model WHERE LOWER(TRIM(Vehicle_Manufacturer)) = LOWER(TRIM(?)) AND LOWER(TRIM(Vehicle_Model)) = LOWER(TRIM(?)) AND ID != ? LIMIT 1',
        [cleanMfr, cleanModel, id]
      );
      if (existing.length > 0) {
        return { success: false, error: `Duplicate detected: "${cleanMfr} - ${cleanModel}" already exists in the vehicle database.` };
      }

      await mysqlPool.execute(
        'UPDATE vehicle_model SET Vehicle_Manufacturer = ?, Vehicle_Model = ? WHERE ID = ?',
        [cleanMfr, cleanModel, id]
      );
      return { success: true };
    } else {
      const store = readLocalDb();
      if (!store.vehicle_model) store.vehicle_model = [];

      const duplicate = store.vehicle_model.some(
        (vm: any) =>
          (vm.id || vm.ID) !== id &&
          vm.Vehicle_Manufacturer?.trim().toLowerCase() === cleanMfr.toLowerCase() &&
          vm.Vehicle_Model?.trim().toLowerCase() === cleanModel.toLowerCase()
      );

      if (duplicate) {
        return { success: false, error: `Duplicate detected: "${cleanMfr} - ${cleanModel}" already exists in the vehicle database.` };
      }

      const idx = store.vehicle_model.findIndex((vm: any) => (vm.id || vm.ID) === id);
      if (idx === -1) {
        return { success: false, error: 'Vehicle model record not found.' };
      }

      store.vehicle_model[idx] = {
        ...store.vehicle_model[idx],
        Vehicle_Manufacturer: cleanMfr,
        Vehicle_Model: cleanModel
      };

      writeLocalDb(store);
      return { success: true };
    }
  },

  async deleteVehicleModel(id: number): Promise<{ success: boolean; error?: string }> {
    if (!useLocalDb && mysqlPool) {
      const [res]: any = await mysqlPool.execute('DELETE FROM vehicle_model WHERE ID = ?', [id]);
      return { success: res.affectedRows > 0 };
    } else {
      const store = readLocalDb();
      if (!store.vehicle_model) return { success: false };
      const beforeLen = store.vehicle_model.length;
      store.vehicle_model = store.vehicle_model.filter((vm: any) => (vm.id || vm.ID) !== id);
      writeLocalDb(store);
      return { success: store.vehicle_model.length < beforeLen };
    }
  },

  async getDistinctManufacturers(): Promise<string[]> {
    if (!useLocalDb && mysqlPool) {
      const [rows]: any = await mysqlPool.execute('SELECT DISTINCT Vehicle_Manufacturer FROM vehicle_model ORDER BY Vehicle_Manufacturer ASC');
      return rows.map((r: any) => r.Vehicle_Manufacturer);
    } else {
      const store = readLocalDb();
      const manufacturers = Array.from(new Set(store.vehicle_model.map((vm: any) => vm.Vehicle_Manufacturer))) as string[];
      return manufacturers.sort();
    }
  },

  async getModelsForManufacturer(manufacturer: string): Promise<string[]> {
    if (!useLocalDb && mysqlPool) {
      const [rows]: any = await mysqlPool.execute(
        'SELECT Vehicle_Model FROM vehicle_model WHERE Vehicle_Manufacturer = ? ORDER BY Vehicle_Model ASC',
        [manufacturer]
      );
      return rows.map((r: any) => r.Vehicle_Model);
    } else {
      const store = readLocalDb();
      const models = store.vehicle_model
        .filter((vm: any) => vm.Vehicle_Manufacturer === manufacturer)
        .map((vm: any) => vm.Vehicle_Model);
      return models.sort();
    }
  },

  // 6. 31-Day image retention automated cleanup
  async cleanupOldImages(days = 31): Promise<{ deletedRecords: number; deletedFiles: string[] }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    console.log(`🧹 Running cleanup of media older than ${days} days (${cutoffStr})...`);
    const deletedFiles: string[] = [];
    let count = 0;

    // This gets handled in server SFTP / Local clean logic
    // We can clear database references in preamji_attendance or workorders
    if (!useLocalDb && mysqlPool) {
      // Nullify old images or delete old rows as needed per business logic.
      // We will nullify image paths of attendance records older than cutoffStr
      const [result]: any = await mysqlPool.execute(
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
      store.preamji_attendance.forEach((a: any) => {
        if (a.attendance_date < cutoffStr) {
          if (a.on_duty_in_image) { deletedFiles.push(a.on_duty_in_image); a.on_duty_in_image = null; }
          if (a.intermidiate_off_out_image) { deletedFiles.push(a.intermidiate_off_out_image); a.intermidiate_off_out_image = null; }
          if (a.intermidiate_off_in_image) { deletedFiles.push(a.intermidiate_off_in_image); a.intermidiate_off_in_image = null; }
          if (a.on_duty_out_image) { deletedFiles.push(a.on_duty_out_image); a.on_duty_out_image = null; }
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
