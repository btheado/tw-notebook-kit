// query output can be converted to a javascript array of rows. Rows have
// a `toJSON` method
(await db.query("select * from test")).toArray().map(row => row.toJSON())