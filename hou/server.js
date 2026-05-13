const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session'); 

const app = express();

// 中间件
app.use(cors({
    origin: 'http://127.0.0.1:5500',  // 前端地址
    credentials: true                  // 允许发送cookie
}));
app.use(express.json());
app.use(bodyParser.json());

// Session配置
app.use(session({
  secret: 'my-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000  // 24小时
  }
}));

// 数据库配置
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'Xiaoye1234',
  database: 'campus_card',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 登录接口
app.post('/api/login', async (req, res) => {
  const { student_id, password,role } = req.body;
  console.log('收到登录请求:', { student_id, role });
  // 验证输入是否为空
  if (!student_id || !password) {
    return res.status(400).json({
      success: false,
      message: '学号和密码不能为空'
    });
  }
  
  try {
    // 查询数据库
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE student_id=? AND password=? AND role=?',
      [student_id, password,role]
    );
    
    if (rows.length > 0) {
      // 获取用户角色(假设表中有role字段)
      const user = rows[0];
      
      // 保存用户信息到session
      req.session.user = {
        id: user.id,
        role: user.role,
        student_id: user.student_id,
        name: user.name,
        className: user.class_name
      };
      req.session.isLoggedIn = true;
      
      console.log('Session设置成功:', req.session.user);

      res.json({
        success: true,
        message: '登录成功',
        data: {
        id: user.id,
        student_id: user.student_id,
        role: user.role,
        name:user.name,
        className: user.class_name
        }
      });
    } else {
      res.status(401).json({
        success: false,
        message: '学号、密码或角色错误'
      });
    }
  } catch (error) {
    console.error('数据库查询失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error.message
    });
  }
});

// 获取当前用户信息的接口
app.get('/api/current-user', (req, res) => {
    try {
    // 直接检查session中是否有用户信息
    if (!req.session.user || !req.session.isLoggedIn) {
      return res.json({
        success: false,
        message: '用户未登录'
      });
    }
    
    // 直接从session返回用户信息
    res.json({
      success: true,
      data: {
        id: req.session.user.id,
        role: req.session.user.role,
        student_id: req.session.user.student_id,
        name: req.session.user.name,
        className: req.session.user.className
      }
    });
    
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error.message
    });
  }
});

// 登出接口
app.post('/api/logout', (req, res) => {
  // 销毁session
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: '登出失败'
      });
    }
    
    res.json({
      success: true,
      message: '登出成功'
    });
  });
});

// 获取班级统计数据接口
app.get('/api/class/stats', async (req, res) => {
  try {
    const { className ,month='2026-03'} = req.query;

    if (!className) {
      return res.status(400).json({
        success: false,
        message: '班级名称不能为空'
      });
    }

    const connection = await pool.getConnection();

    try {
      // 查询班级总人数
      const [studentRows] = await connection.execute(
        'SELECT COUNT(*) as total_students FROM users WHERE class_name = ?',
        [className]
      );

      // 查询班级月总消费
      const [consumeRows] = await connection.execute(
        `SELECT SUM(cr.amount) as total_consume 
        FROM consume_records cr
        INNER JOIN users u ON cr.student_id = u.student_id
        WHERE u.class_name = ? 
        AND DATE_FORMAT(cr.record_date, "%Y-%m") = ?`,
        [className, month]
      );

      const totalStudents = studentRows[0].total_students;
      const totalConsume = consumeRows[0].total_consume || 0;
      const avgConsume = totalStudents > 0 ? (totalConsume / totalStudents).toFixed(2) : 0;

      // 3. 查询详细的异常消费学生信息
      const [abnormalRows] = await connection.execute(
        `SELECT COUNT(DISTINCT cr.student_id) as abnormal_count
         FROM consume_records cr
         INNER JOIN users u ON cr.student_id = u.student_id
         WHERE u.class_name = ? 
         AND DATE_FORMAT(cr.record_date, "%Y-%m") = ?
         AND (
           cr.amount > 300.00  -- 单笔消费超过300
           OR EXISTS (        
             SELECT 1
             FROM consume_records cr2
             WHERE cr2.student_id = cr.student_id
             AND DATE_FORMAT(cr2.record_date, "%Y-%m") = ?
             GROUP BY cr2.student_id
             HAVING SUM(cr2.amount) < 800.00
           )
         )`,
        [className, month, month]  // 两个month参数
      );

      res.json({
        success: true,
        data: {
          className: className,
          month: month,
          totalStudents: totalStudents,
          totalConsume: parseFloat(totalConsume),
          avgConsume: parseFloat(avgConsume),
          abnormalCount: abnormalRows[0].abnormal_count || 0
        }
      });
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('获取班级统计失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error.message
    });
  }
});

// 获取班级消费类别分布接口
app.get('/api/class/categories', async (req, res) => {
    try {
        const { className, month = '2026-03' } = req.query;
        
        if (!className) {
            return res.status(400).json({ 
                success: false, 
                message: '班级名称不能为空' 
            });
        }
        
        const connection = await pool.getConnection();
        
        try {
            // 查询当前班级各类别的消费总和
            const [rows] = await connection.execute(
                `SELECT 
                    cr.category,
                    SUM(cr.amount) as total_amount
                 FROM consume_records cr
                 INNER JOIN users u ON cr.student_id = u.student_id
                 WHERE u.class_name = ?
                 AND DATE_FORMAT(cr.record_date, '%Y-%m') = ?
                 GROUP BY cr.category
                 ORDER BY total_amount DESC`,
                [className, month]
            );
            
            // 转换为对象格式
            const categoryData = {};
            rows.forEach(row => {
                categoryData[row.category] = row.total_amount;
            });
            
            res.json({
                success: true,
                data: categoryData
            });
            
        } finally {
            connection.release();
        }
        
    } catch (error) {
        console.error('获取消费类别失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
});

// 获取异常消费详情接口（返回学生列表）
app.get('/api/class/abnormal-details', async (req, res) => {
  try {
    const { className, month = '2026-03' } = req.query;

    if (!className) {
      return res.status(400).json({
        success: false,
        message: '班级名称不能为空'
      });
    }

    const connection = await pool.getConnection();

    try {
      // 1. 先查询班级平均消费
      const [avgRows] = await connection.execute(
        `SELECT 
          AVG(student_total.total_consume) as avg_consume
         FROM (
           SELECT u.student_id, SUM(cr.amount) as total_consume
           FROM consume_records cr
           INNER JOIN users u ON cr.student_id = u.student_id
           WHERE u.class_name = ?
           AND DATE_FORMAT(cr.record_date, "%Y-%m") = ?
           GROUP BY u.student_id
         ) student_total`,
        [className, month]
      );

      const classAvgConsume = avgRows[0]?.avg_consume || 0;

      // 2. 查询异常消费学生详情
      const [abnormalRows] = await connection.execute(
        `SELECT 
          u.student_id,
          u.name,
          SUM(cr.amount) as month_consume,
          COUNT(*) as consume_count,
          MAX(cr.amount) as max_single_amount,
          GROUP_CONCAT(DISTINCT cr.category SEPARATOR ',') as categories
         FROM consume_records cr
         INNER JOIN users u ON cr.student_id = u.student_id
         WHERE u.class_name = ?
         AND DATE_FORMAT(cr.record_date, "%Y-%m") = ?
         GROUP BY u.student_id, u.name
         HAVING (
           MAX(cr.amount) > 300.00
           OR SUM(cr.amount) < 800.00
         )`,
        [className, month]
      );

      // 3. 计算每个学生的餐饮消费占比
      const students = await Promise.all(abnormalRows.map(async (row) => {
        // 查询餐饮消费
        const [foodRows] = await connection.execute(
          `SELECT SUM(amount) as food_total
           FROM consume_records
           WHERE student_id = ?
           AND DATE_FORMAT(record_date, "%Y-%m") = ?
           AND category = '餐饮'`,
          [row.student_id, month]
        );

        const foodTotal = foodRows[0]?.food_total || 0;
        const foodRatio = row.month_consume > 0 
          ? ((foodTotal / row.month_consume) * 100).toFixed(1)
          : 0;

        // 计算与平均值的对比
        const avgCompare = classAvgConsume > 0
          ? (((row.month_consume - classAvgConsume) / classAvgConsume) * 100).toFixed(0)
          : 0;

        // 判断预警类型
        let alertType = '';
        if (row.max_single_amount > 300 && row.month_consume < 800) {
          alertType = '严重异常';
        } else if (row.max_single_amount > 300) {
          alertType = '单笔消费过高';
        } else if (row.month_consume < 800) {
          alertType = '月总消费过低';
        } else {
          alertType = '异常波动';
        }

        return {
          student_id: row.student_id,
          name: row.name,
          month_consume: row.month_consume,
          avg_compare: parseFloat(avgCompare) > 0 ? `+${avgCompare}%` : `${avgCompare}%`,
          food_ratio: `${foodRatio}%`,
          alert_type: alertType,
          consume_count: row.consume_count,
          max_single_amount: row.max_single_amount
        };
      }));

      res.json({
        success: true,
        data: students
      });

    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('获取异常消费详情失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error.message
    });
  }
});

// 获取学生消费排行榜接口（最高/最低各5名）
app.get('/api/rankings/monthly', async (req, res) => {
  try {
    const { className, month = '2026-03' } = req.query;

    if (!className) {
      return res.status(400).json({
        success: false,
        message: '班级名称不能为空'
      });
    }

    const connection = await pool.getConnection();

    try {
      // 1. 查询班级所有学生本月消费总额
      const [studentConsume] = await connection.execute(
        `SELECT 
          u.student_id,
          u.name,
          SUM(cr.amount) as month_consume
         FROM consume_records cr
         INNER JOIN users u ON cr.student_id = u.student_id
         WHERE u.class_name = ?
         AND DATE_FORMAT(cr.record_date, "%Y-%m") = ?
         GROUP BY u.student_id, u.name
         HAVING month_consume IS NOT NULL
         ORDER BY month_consume DESC`,
        [className, month]
      );

      // 2. 处理数据，确保是数字类型
      const validStudents = studentConsume.filter(item => 
        item.month_consume !== null && item.month_consume !== undefined
      ).map(item => ({
        ...item,
        month_consume: parseFloat(item.month_consume) || 0
      }));

      // 3. 消费最高 TOP 5
      const topSpenders = validStudents
        .filter(item => item.month_consume > 0) // 排除消费为0的学生
        .slice(0, 5)
        .map((item, index) => ({
          rank: index + 1,
          student_id: item.student_id,
          name: item.name,
          month_consume: item.month_consume.toFixed(2)
        }));

      // 4. 消费最低 TOP 5
      const lowSpenders = validStudents
        .filter(item => item.month_consume > 0) // 排除消费为0的学生
        .slice(-5)
        .reverse() // 从低到高排序
        .map((item, index) => ({
          rank: index + 1,
          student_id: item.student_id,
          name: item.name,
          month_consume: item.month_consume.toFixed(2)
        }));

      res.json({
        success: true,
        data: {
          top_spenders: topSpenders,
          low_spenders: lowSpenders
        }
      });

    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('获取消费排行榜失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error.message
    });
  }
});

app.get('/api/student/consume', async (req, res) => {
  const studentId = req.query.studentId || 'S002';
  const currentYear = 2026;
  const currentMonth = 3; 
  
  try {
    // 从数据库查询该学生的消费记录（确保 amount 是数字）
    const [rows] = await pool.execute(
      // 'SELECT * FROM consume_records WHERE student_id = ?',
      // 使用范围查询：2026年3月1日 到 2026年3月31日
      `SELECT * FROM consume_records 
      WHERE student_id = ? 
        AND record_date >= '2026-03-01' 
        AND record_date <= '2026-03-31'`,
      [studentId]
    );

    const [lastrows] = await pool.execute(
      `SELECT * FROM consume_records 
      WHERE student_id = ? 
        AND record_date >= '2026-02-01' 
        AND record_date <= '2026-02-28'`,
      [studentId]
    );

    // 转换 amount 为数字（防止数据库返回字符串）
    const numericRows = rows.map(row => ({
      ...row,
      amount: parseFloat(row.amount) // 或 Number(row.amount)
    }));
    const lastnumericRows = lastrows.map(lastrow => ({
      ...lastrow,
      amount: parseFloat(lastrow.amount) // 或 Number(row.amount)
    }));

    const totalMonth = numericRows.reduce((sum, r) => sum + r.amount, 0).toFixed(2);
    const lasttotalMonth = lastnumericRows.reduce((sum, r) => sum + r.amount, 0).toFixed(2);
    
    // 计算餐饮消费总和
    const foodRecords = numericRows.filter(r => r.category === '餐饮');
    const foodTotal = foodRecords.reduce((sum, r) => sum + r.amount, 0);
    
    // 计算餐饮占比（注意：totalMonth 是字符串，需转数字）
    const foodRatio = ((foodTotal / parseFloat(totalMonth)) * 100).toFixed(2);
    
    // 计算日均消费（简化：总消费 / 30天）
    const avgDay = (parseFloat(totalMonth) / 30).toFixed(2); 

    const diffLastMonth = ((parseFloat(totalMonth)-parseFloat(lasttotalMonth)) / parseFloat(lasttotalMonth) * 100).toFixed(2);
   
    res.json({
      success: true,
      data: {
        totalMonth,    // 本月总消费（字符串，如 "345.50"）
        foodRatio: `${foodRatio}%`, // 餐饮占比（如 "45.20%"）
        avgDay,        // 日均消费（如 "11.52"）
        diffLastMonth
      }
    });
  } catch (err) {
    console.error('数据库查询失败:', err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 处理添加消费记录
app.post('/api/student/consume/add', async (req, res) => {
  const { studentId, amount, category, location, recordDate, description } = req.body;

  try {
    // 插入数据库
    const [result] = await pool.execute(
      'INSERT INTO consume_records (student_id, amount, category, location, record_date, description) VALUES (?, ?, ?, ?, ?, ?)',
      [studentId, amount, category, location, recordDate, description]
    );

    res.json({
      success: true,
      message: '消费记录添加成功',
      data: { id: result.insertId }, // 返回新记录的ID
    });
  } catch (err) {
    console.error('添加消费记录失败：', err);
    res.status(500).json({
      success: false,
      message: '服务器错误，添加失败',
    });
  }
});

app.get('/api/student/stats', async (req, res) => {
  const studentId = req.query.studentId;

  try {
    // 直接使用 pool.execute() 执行查询，无需 connection 变量
    const [rows] = await pool.execute(`
      SELECT 
        DATE_FORMAT(record_date, '%Y-%m') AS month,
        IFNULL(SUM(amount), 0) AS total_amount
      FROM consume_records
      WHERE student_id = ?
        AND record_date BETWEEN '2026-01-01' AND '2026-03-31'
      GROUP BY month
      ORDER BY month
    `, [studentId]);

    // 生成 2026-01, 2026-02, 2026-03 三个月的数据
    const months = ['2026-01', '2026-02', '2026-03'];
    const dataMap = {};
    
    // 初始化为 0
    months.forEach(m => dataMap[m] = 0);
    
    // 填充查询结果
    rows.forEach(row => {
      dataMap[row.month] = parseFloat(row.total_amount);
    });

    // 返回标准格式
    res.json({
      studentId,
      months,
      amounts: months.map(m => dataMap[m])
    });

  } catch (error) {
    console.error('查询失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 3月份消费类别分布
app.get('/api/student/category-stats', async (req, res) => {
  const studentId = req.query.studentId || 'S002';
  const yearMonth = '2026-03'; // 固定查询3月

  try {
    // 查询3月份各消费类别的总额
    const [rows] = await pool.execute(`
      SELECT 
        category,
        IFNULL(SUM(amount), 0) as total_amount
      FROM consume_records
      WHERE student_id = ?
        AND DATE_FORMAT(record_date, '%Y-%m') = ?
        AND category IS NOT NULL
        AND category != ''
      GROUP BY category
      ORDER BY total_amount DESC
    `, [studentId, yearMonth]);

    // 格式化数据
    const categories = [];
    const amounts = [];

    rows.forEach(row => {
      categories.push(row.category || '未分类');
      amounts.push(parseFloat(row.total_amount));
    });

    res.json({
      success: true,
      studentId,
      yearMonth,
      categories,
      amounts
    });

  } catch (error) {
    console.error('查询失败:', error);
    res.status(500).json({ 
      success: false, 
      error: '查询失败',
      categories: [],
      amounts: []
    });
  }
});

// 获取近期消费记录
app.get('/api/student/recent-records', async (req, res) => {
  const studentId = req.query.studentId || 'S002';
  
  try {
    const [rows] = await pool.execute(`
       SELECT 
        id,
        DATE_FORMAT(record_date, '%Y-%m-%d') as record_date, 
        amount,
        category,
        location,
        description
      FROM consume_records
      WHERE student_id = ?
      ORDER BY record_date DESC
      LIMIT 5
    `, [studentId]);
    
    res.json({ data: rows });
    
  } catch (error) {
    console.error('查询失败:', error);
    res.json({ data: [] });
  }
});

// 删除接口
app.delete('/api/student/delete', async (req, res) => {
  const id = req.query.id;
  
  try {
    await pool.execute(`DELETE FROM consume_records WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('删除失败:', error);
    res.json({ success: false });
  }
});

// 查看消费详情：根据学号查询异常消费记录
app.get('/api/student/consume/detail', async (req, res) => {
  const studentId = req.query.studentId;
  if (!studentId) {
    return res.status(400).json({ success: false, message: '学号不能为空' });
  }

  try {
    const month='2026-03';
    // 首先计算本月总消费
    const [monthStats] = await pool.execute(`
      SELECT 
        SUM(amount) as month_total,
        COUNT(*) as record_count,
        MAX(amount) as max_single_amount,
        MIN(amount) as min_single_amount
      FROM consume_records
      WHERE student_id = ?
        AND DATE_FORMAT(record_date, '%Y-%m') =?
    `, [studentId,month]);

    const monthTotal = parseFloat(monthStats[0]?.month_total || 0);
    const isMonthLow = monthTotal < 800; // 月总消费低于800元判断

    // 查询消费记录
    let sql = '';
    let params = [];
    
    if (isMonthLow) {
      // 月总消费低于800元，查询本月所有消费记录
      sql = `
        SELECT 
          id,
          DATE_FORMAT(record_date, '%Y-%m-%d') as record_date,
          amount,
          category,
          location,
          description,
          CASE
            -- 月总消费低的异常
            WHEN ? THEN '月总消费过低'
            -- 其他异常判断
            WHEN amount > 300 THEN '单笔过高'
            ELSE '普通消费'
          END as alert_type
        FROM consume_records
        WHERE student_id = ?
          AND DATE_FORMAT(record_date, '%Y-%m') = ?
        ORDER BY record_date DESC
      `;
      params = [true, studentId,month];
    } else {
      // 月总消费正常，只查询其他异常记录
      sql = `
        SELECT 
          id,
          DATE_FORMAT(record_date, '%Y-%m-%d') as record_date,
          amount,
          category,
          location,
          description,
          CASE
            WHEN amount > 300 THEN '单笔过高'
            ELSE '普通消费'
          END as alert_type
        FROM consume_records
        WHERE student_id = ?
          AND DATE_FORMAT(record_date, '%Y-%m') = ?
          AND (
            amount > 300 
          )
        ORDER BY record_date DESC
      `;
      params = [studentId,month];
    }

    const [rows] = await pool.execute(sql, params);

    // 重新整理异常类型判断
    const processedRows = rows.map(record => {
      // 如果是月总消费低的情况，标记所有记录为异常
      if (isMonthLow) {
        return {
          ...record,
          alert_type: '月总消费过低',
          is_month_low: true
        };
      }
      return record;
    });

    // 计算统计信息
    let totalAmount = 0;
    let abnormalCount = 0;
    const abnormalTypes = new Set();
    
    processedRows.forEach(record => {
      totalAmount += parseFloat(record.amount);
      
      // 月总消费低的情况，所有记录都算异常
      if (isMonthLow || record.alert_type !== '普通消费') {
        abnormalCount++;
        abnormalTypes.add(record.alert_type);
      }
    });

    res.json({
      success: true,
      data: {
        student_id: studentId,
        is_month_low: isMonthLow,  // 新增：月总消费是否过低
        month_total: monthTotal.toFixed(2),  // 新增：月总消费额
        records: processedRows,
        summary: {
          abnormal_count: abnormalCount,
          total_amount: totalAmount.toFixed(2),
          abnormal_types: Array.from(abnormalTypes)
        }
      }
    });
  } catch (err) {
    console.error('查询异常消费详情失败：', err);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 教师发起联系
app.post('/api/teacher/contact', async (req, res) => {
  const { teacherId, studentId, contactMethod, contactContent, remark } = req.body;
  
  if (!teacherId || !studentId || !contactMethod) {
    return res.status(400).json({ success: false, message: '缺少必要参数' });
  }

  try {
    // 插入联系记录
    const [result] = await pool.execute(
      `INSERT INTO teacher_contact 
       (teacher_id, student_id, contact_method, contact_content, remark) 
       VALUES (?, ?, ?, ?, ?)`,
      [teacherId, studentId, contactMethod, contactContent || '', remark || '']
    );
    
    // 这里可以添加实际发送通知的逻辑（如短信、邮件等）
    // 例如调用短信服务API发送通知
    
    res.json({
      success: true,
      message: '联系请求已提交',
      data: {
        contactId: result.insertId,
        status: '已提交'
      }
    });
  } catch (error) {
    console.error('联系学生失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取联系历史
app.get('/api/teacher/contact/history', async (req, res) => {
  const { teacherId, studentId } = req.query;
  
  if (!teacherId) {
    return res.status(400).json({ success: false, message: '教师ID不能为空' });
  }

  try {
    let sql = `
      SELECT 
        tc.*,
        s.name as student_name,
        t.name as teacher_name
      FROM teacher_contact tc
      LEFT JOIN users s ON tc.student_id = s.id
      LEFT JOIN users t ON tc.teacher_id = t.id
      WHERE tc.teacher_id = ?
    `;
    let params = [teacherId];
    
    if (studentId) {
      sql += ' AND tc.student_id = ?';
      params.push(studentId);
    }
    
    sql += ' ORDER BY tc.contact_time DESC';
    
    const [rows] = await pool.execute(sql, params);
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('获取联系历史失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

app.get('/api/student/messages', async (req, res) => {
  const studentId = req.query.studentId;
  
  if (!studentId) {
    return res.status(400).json({ 
      success: false, 
      message: '学号不能为空' 
    });
  }

  try {
    // 查询该学生的所有消息，关联教师信息
    const [rows] = await pool.execute(`
      SELECT 
        tc.id,
        tc.teacher_id,
        tc.student_id,
        tc.contact_time,
        tc.contact_method,
        tc.contact_content,
        tc.status,
        tc.remark,
        tc.is_read,
        t.name as teacher_name
      FROM teacher_contact tc
      LEFT JOIN users t ON tc.teacher_id = t.student_id
      WHERE tc.student_id = ?
      ORDER BY tc.contact_time DESC
    `, [studentId]);
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('获取学生消息失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器错误' 
    });
  }
});

// 2. 获取单条消息详情
app.get('/api/student/message/:id', async (req, res) => {
  const messageId = req.params.id;
  
  if (!messageId) {
    return res.status(400).json({ 
      success: false, 
      message: '消息ID不能为空' 
    });
  }

  try {
    const [rows] = await pool.execute(`
      SELECT 
        tc.*,
        t.name as teacher_name
      FROM teacher_contact tc
      LEFT JOIN users t ON tc.teacher_id = t.student_id
      WHERE tc.id = ?
    `, [messageId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '消息不存在' 
      });
    }
    
    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('获取消息详情失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器错误' 
    });
  }
});

// 3. 标记消息为已读
app.post('/api/student/message/read/:id', async (req, res) => {
  const messageId = req.params.id;
  
  if (!messageId) {
    return res.status(400).json({ 
      success: false, 
      message: '消息ID不能为空' 
    });
  }

  try {
    // 更新消息为已读状态
    const [result] = await pool.execute(
      'UPDATE teacher_contact SET is_read = 1 WHERE id = ?',
      [messageId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '消息不存在' 
      });
    }
    
    res.json({
      success: true,
      message: '消息已标记为已读'
    });
  } catch (error) {
    console.error('标记已读失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器错误' 
    });
  }
});

// 4. 学生回复消息
app.post('/api/student/reply', async (req, res) => {
  const { messageId, studentId, replyContent } = req.body;
  
  if (!messageId || !studentId || !replyContent) {
    return res.status(400).json({ 
      success: false, 
      message: '缺少必要参数' 
    });
  }

  try {
    // 首先检查消息是否存在
    const [checkRows] = await pool.execute(
      'SELECT id FROM teacher_contact WHERE id = ? AND student_id = ?',
      [messageId, studentId]
    );
    
    if (checkRows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '消息不存在或不属于该学生' 
      });
    }
    
    // 插入回复记录
    const [result] = await pool.execute(
      `INSERT INTO message_replies 
       (message_id, student_id, reply_content) 
       VALUES (?, ?, ?)`,
      [messageId, studentId, replyContent]
    );
    
    await pool.execute(
      'UPDATE teacher_contact SET status = "已联系" WHERE id = ?',
      [messageId]
    );
    
    res.json({
      success: true,
      message: '回复已发送',
      data: {
        replyId: result.insertId,
        replyTime: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('发送回复失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器错误' 
    });
  }
});

// 5. 获取未读消息数
app.get('/api/student/messages/unread', async (req, res) => {
  const studentId = req.query.studentId;
  
  if (!studentId) {
    return res.status(400).json({ 
      success: false, 
      message: '学号不能为空' 
    });
  }
  
  try {
    const [rows] = await pool.execute(`
      SELECT COUNT(*) as unreadCount
      FROM teacher_contact
      WHERE student_id = ? AND is_read = 0
    `, [studentId]);
    
    res.json({
      success: true,
      data: {
        unreadCount: rows[0].unreadCount
      }
    });
  } catch (error) {
    console.error('获取未读数失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器错误' 
    });
  }
});

// 启动服务器
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`后端服务运行在 http://localhost:${PORT}`);
});