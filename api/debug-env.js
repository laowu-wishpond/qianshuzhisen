export default function handler(req, res) {
    const report = {};
    for (const k of Object.keys(process.env)) {
          if (/SUPA|SITE|ECPAY/i.test(k)) {
                  const v = process.env[k];
                  report[k] = { length: v ? v.length : 0, startsOk: v ? v.slice(0, 3) : null };
          }
    }
    res.status(200).json({
          totalEnvKeys: Object.keys(process.env).length,
          matched: report,
          vercelEnv: process.env.VERCEL_ENV || null,
    });
}
