---
title: Hướng dẫn sử dụng Microservice, Eureka và Zuul Gateway - Phần 1
date: 2023-08-10T11:18:56+07:00
tags: []
series: []
featured: true
---
Bài viết này cung cấp một hướng dẫn chi tiết về việc triển khai và sử dụng kiến trúc Microservice kết hợp với các công cụ Eureka và Zuul Gateway. Đây là những bước cơ bản để xây dựng một hệ thống phân tán linh hoạt và có khả năng mở rộng.

<!--more-->
# 1. Giới thệu
**Microservices** là một mô hình kiến trúc phần mềm đột phá, cho phép các ứng dụng được chia thành các phần nhỏ hơn và độc lập, được gọi là "microservices". Mỗi microservice có thể phát triển, triển khai và quản lý riêng biệt, giúp tối ưu hóa khả năng mở rộng và duy trì.

Bây giờ tôi sẽ triển khai một hệ thống đơn giản như sau:
![Scenario 1: Across columns](/model.png)

# 2. Eureka server
Là máy chủ dùng để quản lý, đặt tên cho các service hay còn gọi là `service registry`, mục đích của nó là thay vì phải nhớ 64.233.181.99 thì bạn có thể vào trực tiếp google bằng địa chỉ google.com và khi mà các service thay đổi địa chỉ thì Eureka sẽ tự động cập nhật mà bạn không cần phải thay đổi code.

Mỗi service sẽ được đăng ký với Eureka và sẽ ping cho Eureka để đảm bảo chúng vẫn còn hoạt động, Nếu Eureka không nhận được thông báo nào từ service thì service đó sẽ tự động bị xoá.

Ok bây giờ hãy tạo mới project spring boot dùng Maven để quản lý dependencies và khai báo file `pom.xml` như sau:
```
<dependencies>  
    <dependency>  
        <groupId>org.springframework.boot</groupId>  
        <artifactId>spring-boot-starter-web</artifactId>  
    </dependency>  
    <dependency>  
        <groupId>org.springframework.cloud</groupId>  
        <artifactId>spring-cloud-starter-netflix-eureka-server</artifactId>  
    </dependency>  
    <dependency>  
        <groupId>org.springframework.boot</groupId>  
        <artifactId>spring-boot-devtools</artifactId>  
        <scope>runtime</scope>  
    </dependency>  
    <dependency>  
        <groupId>org.springframework.boot</groupId>  
        <artifactId>spring-boot-starter-test</artifactId>  
        <scope>test</scope>  
    </dependency>  
</dependencies>
```

Tiếp theo trong file `application.yml` cần config như sau:
```
server:
  port: 8761
spring:
  application:
    name: eureka-server
eureka:
  client:
    register-with-eureka: false
    fetch-registry: true
```

Cuối cùng trong class Application, chúng ta sử dụng `@EnableEurekaServer` để khai báo đây là một Eureka Server:
```
@SpringBootApplication
@EnableEurekaServer
public class EurekaServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(EurekaServerApplication.class, args);
    }
}
```

# 3. Zuul Gateway
Zuul là thành phần của hệ thống microservices được phát triển bởi Netflix. Nó hoạt động như một dịch vụ cổng (gateway) trong mô hình kiến trúc ứng dụng microservices, giúp quản lý và điều phối yêu cầu từ clients tới các dịch vụ microservices tương ứng.

Zuul Gateway có các chức năng chính sau:
* Routing (Định tuyến): client sẽ không thể gửi request đến từng serive được, chưa kể việc các service còn giao tiếp qua lại với nhau, thay vào đó client sẽ gửi request trực tiếp tới 1 địa chỉ duy nhất của gateway, lúc này gateway có nhiệm vụ tiếp nhận và phân phối đến các service tương ứng.
* Load Balancing (Cân bằng tải): phân phối request đến nhiều instance của 1 service.
* Authentication và Security (xác thực và bảo mật).

Tiến hành cài đặt Zuul Gateway bằng cách tạo mới project Spring boot sử dụng các dependency sau:
```
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.cloud</groupId>
            <artifactId>spring-cloud-starter-netflix-zuul</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.cloud</groupId>
            <artifactId>spring-cloud-starter-netflix-eureka-client</artifactId>
        </dependency>
```
Sử dụng anotation `@EnableZuulProxy` và `@EnableEurekaClient` để khai báo đây là Zuul và Eureka Client:
```
@SpringBootApplication
@EnableZuulProxy
@EnableEurekaClient
public class ZuulServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(ZuulServerApplication.class, args);
    }
}
```

Và đừng quên config nữa nhé:
```
server:
  port: 8080

zuul:
  routes:
    user-service:
      path: /user/**
      service-id: user-service
    product-service:
      path: /product/**
      service-id: product-service

spring:
  application:
    name: zuul-server

eureka:
  client:
    serviceUrl:
      defaultZone: http://localhost:8761/eureka/
    register-with-eureka: true
    fetch-registry: true
  instance:
    prefer-ip-address: true
```
>Định nghĩa routers ở trong zuul nói cho zuul biết rằng khi user truy cập với đường dẫn `/user/**` thì chuyển hướng tới user-service
>, còn service-id như ở trên mình đã nói Eureka sẽ đăng ký user service với cái tên là user-service thay vì sử dụng `http://localhost:8083`
# 4. Bussiness service
Các Eureka client service là một service độc lập trong kiến trúc microservice. Mỗi client service chỉ thực hiện duy nhất một nghiệp vụ nào đó trong hệ thống như thanh toán, tài khoản, thông báo, xác thực, cấu hình,…

**User Service**

Ok, cũng như Eureka Server, chúng ta sẽ tạo một project Spring Boot mới nhưng sử dụng Eureka Client trong file `pom.xml`:
```
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.cloud</groupId>
            <artifactId>spring-cloud-starter-netflix-eureka-client</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>
```

Trong file `application.yml` chúng ta sẽ ghi nhận lại địa chỉ của Eureka Server:
```
server:
  port: 8083
spring:
  application:
    name: user-service
eureka:
  client:
    service-url:
      defaultZone: http://localhost:8761/eureka/
```
Sau đó để chỉ cho Spring Boot biết đây là một Eureka client, chúng ta dùng annotation `@EnableEurekaClient` trong class main:
```
@SpringBootApplication
@EnableEurekaClient
public class UserServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(UserServiceApplication.class, args);
    }
}
```

Tiến hành tạo controller để test:
* **UserController.java**
```
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class UserController {

    @GetMapping("/user")
    public String getUser() {
        // Hardcode user info
        String userInfo = "Username: john_doe\nFull Name: John Doe\nEmail: john@example.com";

        return userInfo;
    }
}
```
>ở đây mình sẽ hardcode cho nhanh gọn lẹ

# 5. Testing
Ok, như vậy là chúng ta đã tạo xong bộ khung cho hệ thống microservice
Tiến hành run các service theo thứ tự: Eureka, Zuul và User
Để kiểm tra các service của chúng ta vào `localhost://8761` đây là cổng của Eureka Server, và bạn có thể thấy các service đang chạy như hình:
![Scenario 1: Across columns](/service-eureka.png)

Tiến hành run api để get user info
![Scenario 2: Across columns](/api-user-info.png#center)
>khi call api `http://localhost:8083/user-info` đang thực hiện call trực tiếp đến user service port 8083

![Scenario 2: Across columns](/api-user-info2.png#center)

>khi call api `http://localhost:8080/user/user-info` đang thực hiện call thông qua zuul gateway port 8080
>zuul gateway sẽ dựa vào path: /user/** để điều hướng tới user service

Kết thúc phần đầu tiên ở đây, ở phần tiếp theo chúng ta sẽ tìm hiều về cách để xác thực user trong hệ thống microservice và sử dụng Spring Cloud Configuration để config các biến được sử dụng chung cho nhiều service nhé!