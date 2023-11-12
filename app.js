const mysql = require("mysql2");
const express = require("express");
const app = express();
const urlencodedParser = express.urlencoded({extended: false});
const expressHbs = require("express-handlebars");
const hbs = require("hbs");
const bcrypt = require("bcryptjs");

const jwt = require("jsonwebtoken");
const JwtStrategy = require("passport-jwt").Strategy;
const ExtractJwt = require("passport-jwt").ExtractJwt;
const passport = require("passport");
const bodyParser = express.json();

const port = 3000;
const secretKey = "rinat123";

let opts = {};
opts.jwtFromRequest = ExtractJwt.fromBodyField("jwt");
opts.secretOrKey = secretKey;

passport.use(new JwtStrategy(opts,(jwt_payload, done) => {
    return done(null, jwt_payload.login);
}));

const pool = mysql.createPool({
    connectionLimit: 5,
    host: "localhost",
    user: "root",
    database: "apex_guides",
    password: ""
});

app.set("view engine", "hbs");

app.engine("hbs", expressHbs.engine({
    layoutsDir: "views/layouts",
    defaultLayout: "layout",
    extname: "hbs"
}));

app.use(express.static(__dirname + '/public'));

app.get("/", function(req, res){
    res.render("index.hbs", {title: "ALG"});
});

app.get("/create", function(req, res){
    res.render("create.hbs", {title: "Регистрация"});
});

app.get("/createfault", function(req, res){
    res.render("createfault.hbs", {title: "Ошибка регистрации"});
});

app.get("/avtoriz", function(req, res){
    res.render("avtoriz.hbs", {title: "Авторизация"});
});

app.get("/guides", function(req, res){
    res.render("guides.hbs", {title: "Guides"});
});

app.listen(3000, function(){
    console.log("Сервер на 3000 порту ожидает подключения...");
});


// РЕГИСТРАЦИЯ В БАЗЕ guides В ТАБЛИЦЕ users
// ===================================================
app.post("/create", urlencodedParser, function (req, res) {
    try {
        if(!req.body) {
            console.log("Ошибка при регистрации", err);
            return res.sendStatus(400); 
        }
        pool.query("SELECT `Name`, `login` FROM users WHERE `Name` = '" +
        req.body.name + "' OR Login = '" + req.body.login +"'", (err, rows) => {
    
            if(err) {
                res.status(400);
                console.log("Ошибка при чтении из бд", err);
            } else if(typeof rows !== 'undefined' && rows.length > 0){
                console.log('есть в бд')
                res.redirect("/createfault");
                return true;
            } else {
                const Name = req.body.name;
                const Login = req.body.login;
    
                //генерируем hash-пароль из переданного пороля в реквесте
                const salt = bcrypt.genSaltSync(7) 
                const Pass = bcrypt.hashSync(req.body.pass, salt)
    
                pool.query("INSERT INTO users (Name, Login, Password) VALUES (?,?,?)", [Name, Login, Pass], function(err, data) {
                    if(err) return console.log(err);
    
                    res.redirect("/");
                    console.log("Добавили пользователя в базу");
                })
            }
        })
    } catch (e) {
        console.log(e);
        res.status(400).send('Registration error');
    }
});
    
// АВТОРИЗАЦИЯ НА САЙТЕ ПО ИМЕЮЩЕЙСЯ ИНФОРМАЦИИ В БАЗЕ В ТАБЛИЦЕ users
// ===================================================
//
// получаем отправленные данные из формы
app.post("/avtoriz", urlencodedParser, function (req, res) {
    try {
        if(!req.body) {
            console.log("Ошибка в запросе", err);
            return res.sendStatus(400);
        }
        console.log(`${req.body.login}`);
        //берем из базы данные по Login
        pool.query("SELECT * FROM users WHERE `Login` = '"+ req.body.login +"'", (err, result)=>{
            if(err) {
                res.sendStatus(400);
                console.log("Ошибка при чтении из бд", err);
            } else if(result.length <=0) {
                res.sendStatus(401);
                console.log(`пользователь ${req.body.login} нету в бд`);
            } else {
                const row = JSON.parse(JSON.stringify(result));
                row.map(rw => {
                    const match = bcrypt.compareSync(req.body.pass, rw.Password); 
                    if (match) {
                        const token = jwt.sign({
                            id_user: rw.ID,
                            login: rw.Login
                        }, secretKey ,{ expiresIn: 120 * 120 });
                        
                        res.status(200).json({name: rw.Name, token: `${token}`});
                        console.log(`Пользователь с таким именем - ${req.body.login} найден в бд, пароль верный, токен +!`);
                    } else {
                        res.status(403).send(`введен не верный пароль`);
                        console.log(`Пользователь с таким именем - ${req.body.login} есть, но пароль не верный!`);
                    }
                    return true
                });
            };
        });
    } catch (e) {
        console.log(e);
        res.status(400).send('Autorization error');
    }
});


/// РАБОТА С ТАБЛИЦЕЙ remarks для ОТЗЫВОВ
// ===================================================
//
app.get("/remarks-all", (req, res) => {
    //маршрут на страницу с пользователями
    pool.query(`SELECT * FROM remarks`,(err, rows) => {
        if (err) {
            console.log(err);
            return res.sendStatus(500);
        } else {
            res.status(200).render("remarks-all.hbs", {
                title: "Remarks",
                remarks: rows
            });
        }
    });
}, );


app.post("/remarks-all", bodyParser, passport.authenticate("jwt", {session: false}),(req,res) => {
    console.log(req.body);
    if (!req.body || !req.body.subject || !req.body.text) {
        return res.sendStatus(400);
    }
    pool.query(`SELECT id FROM users WHERE login='${req.user}'`,(err,rows) => {
    
        if (err) {
            console.log(err);
            return res.sendStatus(500);
        } else {
            let id = rows[0].id;
            pool.query(`INSERT INTO remarks (ID_user, subject, text) VALUES (${id},'${req.body.subject}','${req.body.text}')`,(err,rows) => {
                if (err) {
                    console.log(err);
                    return res.sendStatus(500);
                } else {
                    res.status(200).render("remarks-all.hbs");
                }
            });
        }
    });
});