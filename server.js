const restify = require('restify')
const amqp = require('amqplib/callback_api')
const corsMiddleware = require('restify-cors-middleware')
const server = restify.createServer()

let tasks = {
    CancelLine: [],
    RepairLine: [],
    NewLines: []
}

server.use(restify.plugins.bodyParser())
const cors = corsMiddleware({
    preflightMaxAge: 5,
    origins: ['*'],
    allowHeaders: ['*'],
    exposeHeaders: ['*']
})

server.pre(cors.preflight)
server.use(cors.actual)
server.post('/task/setOnQueue/', (req, res, next) => {
    let queueName = ""
    const body = JSON.parse(req.body)
    body.tipoTask = parseInt(body.tipoTask)
    const task = JSON.stringify(body)

    switch (body.tipoTask) {
        case 1:
            queueName = "NewLines"
            break

        case 2:
            queueName = "RepairLine"
            break

        case 3:
            queueName = "CancelLine"
            break
    }

    amqp.connect("amqp://localhost", (err, conn) => {
        if (err) {
            console.log(err)
        } else {
            conn.createChannel((err, chan) => {
                if (err) {
                    console.log(err)
                } else {
                    chan.sendToQueue(queueName, new Buffer(task))
                    setTimeout(function () { conn.close(); }, 500)
                }
            })
        }
    })

    res.send({ hasError: false, message: "Inserido em nossa fila de produção" })
    next()
})

server.post('/task/setResolved/', (req, res, next) => {
    const task = JSON.parse(req.body)
    const userTask = "Resolved" + task.id
    amqp.connect("amqp://localhost", (err, conn) => {
        if (err) {
            console.log(err)
        } else {
            conn.createChannel((err, chan) => {
                if (err) {
                    console.log(err)
                } else {
                    console.log(userTask)
                    chan.assertQueue("Resolved", { durable: false })
                    chan.assertQueue(userTask, { durable: false })

                    chan.sendToQueue("Resolved", new Buffer(req.body))
                    chan.sendToQueue(userTask, new Buffer(req.body))
                    setTimeout(function () { conn.close(); }, 500)
                }
            })
        }
    })

    res.send({ hasError: false, message: "Inserido em nossa fila de resolvidas e na fila do cliente de resolvidas " })
    next()
})

server.post('/task/getResolved/', (req, res, next) => {
    const queueResolved = []
    const body = JSON.parse(req.body)
    const userTask = "Resolved" + body.id

    amqp.connect("amqp://localhost", (err, conn) => {
        if (err) {
            console.log(err)
        } else {
            conn.createChannel((err, chan) => {
                if (err) {
                    console.log(err)
                } else {
                    chan.assertQueue(userTask, { durable: false })

                    setTimeout(() => {
                        conn.close()
                        if (queueResolved.length === 0) {
                            res.send({ hasError: false, message: "Nenhuma task resolvida", data: queueResolved })
                            next()
                        } else {
                            res.send({ hasError: false, message: null, data: queueResolved })
                        }
                    }, 3000)

                    chan.consume(userTask, function (msg) {
                        queueResolved.push(msg.content.toString())
                    }, { noAck: true })
                }
            })
        }
    })
})

server.post('/task/getToProcess/', (req, res, next) => {
    const response = {
        hasError: false,
        task: []
    }

    amqp.connect("amqp://localhost", (err, conn) => {
        if (err) {
            console.log(err)
        } else {
            const body = JSON.parse(req.body)
            if (body.queues.indexOf("NewLines") !== -1 && tasks.NewLines.length) {
                response.task.push(tasks.NewLines.shift())
            }

            if (body.queues.indexOf("RepairLine") !== -1 && tasks.RepairLine.length) {
                response.task.push(tasks.RepairLine.shift())
            }

            if (body.queues.indexOf("CancelLine") !== -1 && tasks.CancelLine.length) {
                response.task.push(tasks.CancelLine.shift())
            }

            res.send(response)
            next()
        }
    })
})

server.listen(8000, function () {
    amqp.connect("amqp://localhost", (err, conn) => {
        if (err) {
            console.log(err)
        } else {
            conn.createChannel((err, chan) => {
                if (err) {
                    console.log(err)
                } else {
                    chan.assertQueue("CancelLine", { durable: false })
                    chan.assertQueue("NewLines", { durable: false })
                    chan.assertQueue("RepairLine", { durable: false })

                    chan.consume("CancelLine", function (msg) {
                        tasks.CancelLine.push(msg.content.toString())
                    }, { noAck: true })

                    chan.consume("RepairLine", function (msg) {
                        tasks.RepairLine.push(msg.content.toString())
                    }, { noAck: true })

                    chan.consume("NewLines", function (msg) {
                        tasks.NewLines.push(msg.content.toString())
                    }, { noAck: true })
                }
            })
        }
    })
    console.log('listening on http://localhost:8000')
})